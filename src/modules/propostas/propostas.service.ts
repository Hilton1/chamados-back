// Lado do prestador: mural, enviar/editar (upsert) e cancelar proposta, "minhas propostas".
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import type { Contexto } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import type { ArquivoValidado } from "../../middlewares/upload.js";
import { dadosAnexos, gravarComArquivos, subirArquivos } from "../anexos/arquivos.js";
import { registrarEvento } from "../ordens/estado.js";
import {
  ordemNaoEncontrada,
  visaoDe,
  whereMural,
  wherePrestador,
} from "../ordens/ordens.escopo.js";
import { INCLUDE_ORDEM, serializarOrdens } from "../ordens/ordens.serializer.js";
import { responder } from "../ordens/ordens.service.js";
import type { PropostaInput } from "./propostas.schemas.js";

const conflito = (codigo: string, msg: string) => new AppError(409, codigo, msg);

function prestadorAtivo(ctx: Contexto) {
  const p = ctx.usuario.prestador;
  if (!p || p.status !== "APROVADO" || !p.ativo)
    throw new AppError(
      403,
      "PRESTADOR_NAO_APROVADO",
      "Seu cadastro ainda não foi aprovado pela administradora.",
    );
  return p;
}

export async function mural(ctx: Contexto) {
  const where = whereMural(ctx);
  if (!where) return [];
  const lista = await prisma.ordem.findMany({
    where,
    include: INCLUDE_ORDEM,
    orderBy: [{ urgencia: "desc" }, { createdAt: "desc" }],
  });
  return serializarOrdens(lista, visaoDe(ctx), false);
}

/** Ordens em que o prestador enviou proposta (qualquer situação), as mais recentes primeiro. */
export async function minhas(ctx: Contexto) {
  const prestadorId = ctx.usuario.prestador!.id;
  const lista = await prisma.ordem.findMany({
    where: { propostas: { some: { prestadorId } } },
    include: INCLUDE_ORDEM,
    orderBy: { updatedAt: "desc" },
  });
  return serializarOrdens(lista, visaoDe(ctx), false);
}

/** Propostas que já não podem ser editadas pelo prestador. */
const TRAVADAS = new Set(["TRANSFERIDA", "ACEITA", "RECUSADA"]);

export async function enviar(
  ctx: Contexto,
  ordemId: string,
  input: PropostaInput,
  arquivos: ArquivoValidado[],
) {
  const prestador = prestadorAtivo(ctx);
  const ordem = await prisma.ordem.findFirst({
    where: { AND: [{ id: ordemId }, wherePrestador(ctx)] },
    include: {
      categorias: true,
      anexos: { where: { tipo: "FORMULARIO" }, select: { id: true } },
      propostas: {
        where: { prestadorId: prestador.id },
        include: { anexos: { select: { id: true } } },
      },
    },
  });
  if (!ordem) throw ordemNaoEncontrada();
  if (ordem.status !== "ABERTO")
    throw conflito("PROPOSTAS_ENCERRADAS", "Esta ordem de serviço não recebe mais propostas.");
  if (ordem.prazoPropostasAte <= new Date())
    throw conflito("PRAZO_ENCERRADO", "O prazo para propostas desta ordem de serviço terminou.");
  const atende = new Set(prestador.categorias.map((c) => c.categoriaId));
  if (!ordem.categorias.some((c) => atende.has(c.categoriaId)))
    throw new AppError(
      403,
      "TIPO_NAO_ATENDIDO",
      "Você não atende nenhum dos tipos de serviço desta ordem.",
    );

  const existente = ordem.propostas[0];
  if (existente && TRAVADAS.has(existente.status))
    throw conflito("PROPOSTA_BLOQUEADA", "Esta proposta não pode mais ser editada.");
  const jaTemArquivo =
    !!existente && existente.status !== "CANCELADA" && existente.anexos.length > 0;
  if (ordem.anexos.length > 0 && !jaTemArquivo && arquivos.length === 0)
    throw conflito(
      "FORMULARIO_OBRIGATORIO",
      "Esta ordem de serviço pede o formulário preenchido. Anexe o arquivo para enviar a proposta.",
    );

  const propostaId = existente?.id ?? randomUUID();
  const enviados = await subirArquivos(ordemId, "PROPOSTA", arquivos, propostaId);
  const dados = {
    valor: input.valor,
    disponivelEm: input.disponivelEm,
    tempoExecucaoHoras: input.tempoExecucaoHoras,
    observacao: input.observacao ?? null,
    status: "ENVIADA" as const,
  };
  const nome = prestador.razaoSocial;
  await gravarComArquivos(enviados, () =>
    prisma.$transaction(async (tx) => {
      if (existente) await tx.proposta.update({ where: { id: existente.id }, data: dados });
      else
        await tx.proposta.create({
          data: { id: propostaId, ordemId, prestadorId: prestador.id, ...dados },
        });
      if (enviados.length)
        await tx.anexo.createMany({
          data: dadosAnexos(enviados, {
            ordemId,
            tipo: "PROPOSTA",
            enviadoPorId: ctx.usuario.id,
            propostaId,
          }),
        });

      if (existente?.status === "ENVIADA") return; // edição: sem evento
      const ativas = await tx.proposta.count({
        where: { ordemId, status: { not: "CANCELADA" } },
      });
      await registrarEvento(tx, ordemId, {
        tipo: "PROPOSTA_RECEBIDA",
        texto: existente ? `${nome} reenviou a proposta` : `Proposta recebida de ${nome}`,
        autorId: ctx.usuario.id,
      });
      if (ativas === 3)
        await registrarEvento(tx, ordemId, {
          tipo: "PROPOSTA_RECEBIDA",
          texto: "Terceira proposta recebida — mínimo atingido",
          autorId: null,
          marco: true,
        });
    }),
  );
  return responder(ctx, ordemId);
}

export async function cancelar(ctx: Contexto, propostaId: string) {
  const prestadorId = ctx.usuario.prestador!.id;
  const p = await prisma.proposta.findFirst({ where: { id: propostaId, prestadorId } });
  if (!p) throw new AppError(404, "NAO_ENCONTRADO", "Proposta não encontrada.");
  if (p.status !== "ENVIADA")
    throw conflito(
      "PROPOSTA_BLOQUEADA",
      "Só dá para cancelar a proposta antes de ela ser transferida ou aprovada.",
    );
  await prisma.$transaction(async (tx) => {
    // Condicional: se a administradora transferiu no meio do caminho, não cancela.
    const { count } = await tx.proposta.updateMany({
      where: { id: p.id, status: "ENVIADA" },
      data: { status: "CANCELADA" },
    });
    if (count === 0)
      throw conflito("PROPOSTA_BLOQUEADA", "A proposta mudou de situação. Atualize a página.");
    await registrarEvento(tx, p.ordemId, {
      tipo: "PROPOSTA_RECEBIDA",
      texto: `${ctx.usuario.prestador!.razaoSocial} cancelou a proposta`,
      autorId: ctx.usuario.id,
    });
  });
  return responder(ctx, p.ordemId);
}
