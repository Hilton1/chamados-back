// Arquivos da ordem de serviço: fotos e formulário (quem abriu), comprovação e nota fiscal (prestador
// aprovado) e a conclusão com comprovante de pagamento (gestores). Um arquivo por requisição, exceto
// a conclusão (vários comprovantes no mesmo envio).
import type { TipoAnexo, TipoEvento } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { Contexto } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import type { ArquivoValidado } from "../../middlewares/upload.js";
import { registrarEvento, transicionar } from "../ordens/estado.js";
import { carregarOrdem, exigirGestor } from "../ordens/ordens.escopo.js";
import { propostasValidas, type OrdemCompleta } from "../ordens/ordens.serializer.js";
import { responder } from "../ordens/ordens.service.js";
import { dadosAnexos, gravarComArquivos, subirArquivos } from "./arquivos.js";

const conflito = (codigo: string, msg: string) => new AppError(409, codigo, msg);
const proibido = (msg: string) => new AppError(403, "PERFIL_SEM_PERMISSAO", msg);

const MAX_FOTOS = 6;
const MAX_FORMULARIOS = 3;

const contar = (o: OrdemCompleta, tipo: TipoAnexo) =>
  o.anexos.filter((a) => a.tipo === tipo).length;

/** Grava os anexos (e o evento, se houver) depois de subir os arquivos; limpa o storage se falhar. */
async function anexar(
  ctx: Contexto,
  o: OrdemCompleta,
  tipo: TipoAnexo,
  arquivos: ArquivoValidado[],
  evento?: (nome: string) => { tipo: TipoEvento; texto: string },
) {
  const enviados = await subirArquivos(o.id, tipo, arquivos);
  await gravarComArquivos(enviados, () =>
    prisma.$transaction(async (tx) => {
      await tx.anexo.createMany({
        data: dadosAnexos(enviados, { ordemId: o.id, tipo, enviadoPorId: ctx.usuario.id }),
      });
      if (evento)
        for (const e of enviados)
          await registrarEvento(tx, o.id, { ...evento(e.nome), autorId: ctx.usuario.id });
    }),
  );
  return responder(ctx, o.id);
}

function exigirQuemAbriu(ctx: Contexto, o: OrdemCompleta) {
  if (ctx.perfil === "PRESTADOR" || o.criadoPorId !== ctx.usuario.id)
    throw proibido("Só quem abriu a ordem de serviço anexa estes arquivos.");
}

/** Fotos da abertura (JPG/PNG, até 6), enquanto recebe propostas. */
export async function enviarFoto(ctx: Contexto, id: string, arquivos: ArquivoValidado[]) {
  const o = await carregarOrdem(ctx, id);
  exigirQuemAbriu(ctx, o);
  if (o.status !== "ABERTO")
    throw conflito("ORDEM_FECHADA", "Só dá para anexar fotos enquanto recebe propostas.");
  if (contar(o, "ABERTURA") + arquivos.length > MAX_FOTOS)
    throw conflito("LIMITE_DE_ARQUIVOS", `Até ${MAX_FOTOS} fotos por ordem de serviço.`);
  return anexar(ctx, o, "ABERTURA", arquivos);
}

/** Formulário para o prestador preencher: só antes da primeira proposta (as regras não mudam no meio). */
export async function enviarFormulario(ctx: Contexto, id: string, arquivos: ArquivoValidado[]) {
  const o = await carregarOrdem(ctx, id);
  exigirQuemAbriu(ctx, o);
  if (ctx.perfil === "ZELADOR") throw proibido("O zelador não anexa formulário.");
  if (o.status !== "ABERTO" || propostasValidas(o).length > 0)
    throw conflito(
      "FORMULARIO_BLOQUEADO",
      "O formulário só pode ser anexado antes da primeira proposta.",
    );
  if (contar(o, "FORMULARIO") + arquivos.length > MAX_FORMULARIOS)
    throw conflito(
      "LIMITE_DE_ARQUIVOS",
      `Até ${MAX_FORMULARIOS} formulários por ordem de serviço.`,
    );
  return anexar(ctx, o, "FORMULARIO", arquivos);
}

/** Prestador da proposta ACEITA. */
function exigirPrestadorAprovado(ctx: Contexto, o: OrdemCompleta) {
  const prestadorId = ctx.usuario.prestador?.id;
  const aceita = o.propostas.find((p) => p.status === "ACEITA");
  if (ctx.perfil !== "PRESTADOR" || !aceita || aceita.prestadorId !== prestadorId)
    throw proibido("Só o prestador aprovado anexa estes arquivos.");
  return aceita.prestador.razaoSocial;
}

export async function enviarComprovacao(ctx: Contexto, id: string, arquivos: ArquivoValidado[]) {
  const o = await carregarOrdem(ctx, id);
  const nome = exigirPrestadorAprovado(ctx, o);
  if (o.status !== "EM_EXECUCAO" && o.status !== "CONCLUIDO")
    throw conflito("ORDEM_FECHADA", "Esta ordem de serviço não aceita comprovação.");
  return anexar(ctx, o, "COMPROVACAO", arquivos, (arquivo) => ({
    tipo: "COMPROVACAO_ENVIADA",
    texto: `${nome} enviou "${arquivo}"`,
  }));
}

export async function enviarNotaFiscal(ctx: Contexto, id: string, arquivos: ArquivoValidado[]) {
  const o = await carregarOrdem(ctx, id);
  const nome = exigirPrestadorAprovado(ctx, o);
  if (o.status !== "EM_EXECUCAO")
    throw conflito("ORDEM_FECHADA", "A nota fiscal é anexada durante a execução do serviço.");
  return anexar(ctx, o, "NOTA_FISCAL", arquivos, (arquivo) => ({
    tipo: "NOTA_FISCAL_ENVIADA",
    texto: `${nome} anexou a nota fiscal "${arquivo}"`,
  }));
}

/** Conclusão: exige o comprovante de pagamento e, se a ordem pedir, a nota fiscal já anexada. */
export async function concluir(ctx: Contexto, id: string, comprovantes: ArquivoValidado[]) {
  const o = await carregarOrdem(ctx, id);
  exigirGestor(ctx, o);
  if (o.status !== "EM_EXECUCAO")
    throw conflito("TRANSICAO_INVALIDA", "Só dá para concluir uma ordem de serviço em execução.");
  if (o.exigeNotaFiscal && contar(o, "NOTA_FISCAL") === 0)
    throw conflito(
      "NOTA_FISCAL_PENDENTE",
      "Esta ordem de serviço exige nota fiscal: o prestador ainda não anexou.",
    );
  if (comprovantes.length === 0)
    throw conflito("PAGAMENTO_PENDENTE", "Anexe o comprovante de pagamento para concluir.");

  const enviados = await subirArquivos(o.id, "PAGAMENTO", comprovantes);
  await gravarComArquivos(enviados, () =>
    prisma.$transaction(async (tx) => {
      await tx.anexo.createMany({
        data: dadosAnexos(enviados, {
          ordemId: o.id,
          tipo: "PAGAMENTO",
          enviadoPorId: ctx.usuario.id,
        }),
      });
      await transicionar(
        tx,
        o.id,
        "EM_EXECUCAO",
        "CONCLUIDO",
        {
          tipo: "CONCLUIDO",
          texto: `Serviço concluído por ${ctx.usuario.nome}, com comprovante de pagamento`,
          autorId: ctx.usuario.id,
          marco: true,
        },
        { concluidoPorId: ctx.usuario.id, concluidoEm: new Date() },
      );
    }),
  );
  return responder(ctx, o.id);
}
