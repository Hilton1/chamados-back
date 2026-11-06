// Formato `Ordem` do front (front/types/index.ts), com o que cada perfil pode ver.
//
//   GESTOR    → administradora, síndico, fiscal, zelador (já filtrados pelo escopo): tudo, local exato.
//   PRESTADOR → só a própria proposta. Até ser o aprovado (proposta ACEITA) não vê nome/endereço do
//               condomínio, local, linha do tempo nem arquivos do pós-aprovação; mapa só aproximado (~1 km).
import type { Prisma, TipoAnexo } from "@prisma/client";
import { logger } from "../../lib/logger.js";
import { storage } from "../../lib/storage/index.js";
import { serializarCategoria } from "../categorias/categorias.serializer.js";
import { INCLUDE_CONDOMINIO, serializarCondominio } from "../condominios/condominios.serializer.js";
import { totaisServicos } from "../prestadores/prestadores.service.js";

const INCLUDE_ANEXO = {
  enviadoPor: { select: { nome: true, prestador: { select: { razaoSocial: true } } } },
} satisfies Prisma.AnexoInclude;

export const INCLUDE_ORDEM = {
  condominio: { include: INCLUDE_CONDOMINIO },
  categorias: { include: { categoria: true } },
  criadoPor: { select: { id: true, nome: true } },
  anexos: { where: { propostaId: null }, include: INCLUDE_ANEXO, orderBy: { createdAt: "asc" } },
  eventos: { orderBy: { createdAt: "asc" } },
  propostas: {
    include: {
      prestador: true,
      anexos: { include: INCLUDE_ANEXO, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  },
  avaliacao: true,
} satisfies Prisma.OrdemInclude;

export type OrdemCompleta = Prisma.OrdemGetPayload<{ include: typeof INCLUDE_ORDEM }>;
type PropostaCompleta = OrdemCompleta["propostas"][number];
type AnexoCompleto = OrdemCompleta["anexos"][number];

export type Visao = { tipo: "GESTOR" } | { tipo: "PRESTADOR"; prestadorId: string };

export interface OpcoesSerializacao {
  /** Gera URLs assinadas dos arquivos (detalhe). Listas não precisam. */
  urls: boolean;
  /** Serviços concluídos por prestador (selo "Sem histórico" e nº de serviços na comparação). */
  totais: Map<string, number>;
}

/** URL assinada; arquivo ausente no bucket (ex.: dados de demonstração) não derruba a resposta. */
async function urlAssinada(path: string): Promise<string | undefined> {
  try {
    return await storage().signedUrl(path);
  } catch (err) {
    logger.warn({ err, path }, "não foi possível assinar a URL do anexo");
    return undefined;
  }
}

async function serializarAnexo(a: AnexoCompleto, urls: boolean) {
  return {
    id: a.id,
    nome: a.nomeOriginal,
    mime: a.mimeType,
    tamanhoBytes: a.tamanhoBytes,
    tipo: a.tipo,
    enviadoPor: a.enviadoPor.prestador?.razaoSocial ?? a.enviadoPor.nome,
    createdAt: a.createdAt.toISOString(),
    url: urls ? await urlAssinada(a.storagePath) : undefined,
  };
}

const anexosDo = (o: OrdemCompleta, tipo: TipoAnexo, urls: boolean) =>
  Promise.all(o.anexos.filter((a) => a.tipo === tipo).map((a) => serializarAnexo(a, urls)));

export async function serializarProposta(p: PropostaCompleta, opts: OpcoesSerializacao) {
  return {
    id: p.id,
    ordemId: p.ordemId,
    prestador: {
      id: p.prestador.id,
      razaoSocial: p.prestador.razaoSocial,
      mediaAvaliacao: Number(p.prestador.mediaAvaliacao),
      totalAvaliacoes: p.prestador.totalAvaliacoes,
      totalServicos: opts.totais.get(p.prestadorId) ?? 0,
      emiteNotaFiscal: p.prestador.emiteNotaFiscal,
    },
    valor: Number(p.valor),
    disponivelEm: p.disponivelEm.toISOString(),
    tempoExecucaoHoras: p.tempoExecucaoHoras,
    observacao: p.observacao ?? undefined,
    status: p.status,
    motivoRecusa: p.motivoRecusa ?? undefined,
    arquivos: await Promise.all(p.anexos.map((a) => serializarAnexo(a, opts.urls))),
    createdAt: p.createdAt.toISOString(),
  };
}

/** Aproxima coordenadas (~1 km): o arredondamento é sempre da API, nunca do front. */
const aproximar = (n: number) => Math.round(n * 100) / 100;

function localizacao(o: OrdemCompleta, exata: boolean) {
  const c = o.condominio;
  const lat = c.latitude === null ? undefined : Number(c.latitude);
  const lng = c.longitude === null ? undefined : Number(c.longitude);
  if (exata)
    return {
      precisao: "EXATA" as const,
      latitude: lat,
      longitude: lng,
      endereco: `${c.endereco} — ${c.bairro}, ${c.cidade}`,
    };
  return {
    precisao: "APROXIMADA" as const,
    latitude: lat === undefined ? undefined : aproximar(lat),
    longitude: lng === undefined ? undefined : aproximar(lng),
  };
}

const EM_DISPUTA = new Set(["ENVIADA", "TRANSFERIDA"]);

/** Propostas que contam (o prestador pode cancelar e reenviar). */
export const propostasValidas = (o: { propostas: { status: string }[] }) =>
  o.propostas.filter((p) => p.status !== "CANCELADA");

export async function serializarOrdem(o: OrdemCompleta, visao: Visao, opts: OpcoesSerializacao) {
  const { urls } = opts;
  const validas = propostasValidas(o);
  const emDisputa = o.propostas.filter((p) => EM_DISPUTA.has(p.status)).map((p) => Number(p.valor));
  const aceita = o.propostas.find((p) => p.status === "ACEITA");

  const base = {
    id: o.id,
    numero: o.numero,
    condominio: serializarCondominio(o.condominio),
    categorias: o.categorias.map((c) => serializarCategoria(c.categoria)),
    criadoPor: { id: o.criadoPor.id, nome: o.criadoPor.nome, perfil: o.perfilCriador },
    titulo: o.titulo,
    descricao: o.descricao,
    local: o.local,
    urgencia: o.urgencia,
    status: o.status,
    prazoPropostasAte: o.prazoPropostasAte.toISOString(),
    createdAt: o.createdAt.toISOString(),
    fotos: urls
      ? (
          await Promise.all(
            o.anexos.filter((a) => a.tipo === "ABERTURA").map((a) => urlAssinada(a.storagePath)),
          )
        ).filter((u): u is string => !!u)
      : [],
    formularios: await anexosDo(o, "FORMULARIO", urls),
    exigeNotaFiscal: o.exigeNotaFiscal,
    notasFiscais: await anexosDo(o, "NOTA_FISCAL", urls),
    comprovantesPagamento: await anexosDo(o, "PAGAMENTO", urls),
    comprovacoes: await anexosDo(o, "COMPROVACAO", urls),
    eventos: o.eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      texto: e.texto,
      em: e.createdAt.toISOString(),
      marco: e.marco,
    })),
    totalPropostas: validas.length,
    avaliacao: o.avaliacao
      ? { nota: o.avaliacao.nota, comentario: o.avaliacao.comentario ?? undefined }
      : undefined,
  };

  if (visao.tipo === "GESTOR") {
    return {
      ...base,
      localizacao: localizacao(o, true),
      menorValor: emDisputa.length ? Math.min(...emDisputa) : undefined,
      valorContratado: aceita ? Number(aceita.valor) : undefined,
      propostas: await Promise.all(o.propostas.map((p) => serializarProposta(p, opts))),
    };
  }

  const minha = o.propostas.find((p) => p.prestadorId === visao.prestadorId);
  const liberado = minha?.status === "ACEITA";
  const minhaProposta = minha ? await serializarProposta(minha, opts) : undefined;
  if (liberado)
    return {
      ...base,
      localizacao: localizacao(o, true),
      valorContratado: Number(minha.valor),
      propostas: [],
      minhaProposta,
    };
  return {
    ...base,
    // Antes de ser o aprovado: sem nome/endereço do condomínio, sem local exato (LGPD).
    condominio: {
      ...base.condominio,
      nome: "",
      cnpj: undefined,
      endereco: "",
      latitude: undefined,
      longitude: undefined,
      aprovador: null,
    },
    local: "",
    notasFiscais: [],
    comprovantesPagamento: [],
    comprovacoes: [],
    eventos: [],
    avaliacao: undefined,
    localizacao: localizacao(o, false),
    propostas: [],
    minhaProposta,
  };
}

/** Serializa várias ordens buscando de uma vez os totais de serviços dos prestadores envolvidos. */
export async function serializarOrdens(lista: OrdemCompleta[], visao: Visao, urls: boolean) {
  const ids = [...new Set(lista.flatMap((o) => o.propostas.map((p) => p.prestadorId)))];
  const totais = ids.length ? await totaisServicos(ids) : new Map<string, number>();
  return Promise.all(lista.map((o) => serializarOrdem(o, visao, { urls, totais })));
}
