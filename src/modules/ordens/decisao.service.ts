// Comparação e decisão: transferir para aprovação, aprovar (inclusive direto pela administradora),
// reprovar e o link do WhatsApp. Toda mudança devolve a ordem atualizada.
import { prisma } from "../../lib/prisma.js";
import { linkWhatsapp } from "../../lib/whatsapp.js";
import type { Contexto } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import { transicionar } from "./estado.js";
import { carregarOrdem, ehAprovador, exigirGestor } from "./ordens.escopo.js";
import { serializarProposta, type OrdemCompleta } from "./ordens.serializer.js";
import { totaisServicos } from "../prestadores/prestadores.service.js";
import { responder } from "./ordens.service.js";

const conflito = (codigo: string, msg: string) => new AppError(409, codigo, msg);

function proposta(o: OrdemCompleta, propostaId: string) {
  const p = o.propostas.find((x) => x.id === propostaId);
  if (!p)
    throw new AppError(404, "NAO_ENCONTRADO", "Proposta não encontrada nesta ordem de serviço.");
  return p;
}

function exigirAprovador(ctx: Contexto, o: OrdemCompleta) {
  if (!ehAprovador(ctx, o.condominio))
    throw new AppError(
      403,
      "NAO_E_APROVADOR",
      "Você não é quem aprova as propostas deste condomínio.",
    );
}

/** Propostas da ordem para a tela de comparação (gestores). */
export async function listarPropostas(ctx: Contexto, id: string) {
  const o = await carregarOrdem(ctx, id);
  exigirGestor(ctx, o);
  const totais = await totaisServicos(o.propostas.map((p) => p.prestadorId));
  return Promise.all(o.propostas.map((p) => serializarProposta(p, { urls: true, totais })));
}

export async function transferir(ctx: Contexto, id: string, propostaId: string) {
  const o = await carregarOrdem(ctx, id);
  if (o.status !== "ABERTO")
    throw conflito(
      "TRANSICAO_INVALIDA",
      "Só dá para transferir enquanto a ordem de serviço recebe propostas.",
    );
  if (!o.condominio.aprovador)
    throw conflito(
      "ADMINISTRADORA_APROVA",
      "Neste condomínio quem aprova é a administradora: aprove a proposta direto.",
    );
  const p = proposta(o, propostaId);
  if (p.status !== "ENVIADA")
    throw conflito("PROPOSTA_INVALIDA", "Escolha uma proposta que esteja em disputa.");

  await prisma.$transaction(async (tx) => {
    await tx.proposta.update({
      where: { id: p.id },
      data: { status: "TRANSFERIDA", transferidaPorId: ctx.usuario.id, transferidaEm: new Date() },
    });
    await transicionar(tx, id, "ABERTO", "AGUARDANDO_APROVACAO", {
      tipo: "TRANSFERIDA",
      texto: `Administradora transferiu para aprovação de ${o.condominio.aprovador!.nome} a proposta de ${p.prestador.razaoSocial}`,
      autorId: ctx.usuario.id,
    });
  });
  return responder(ctx, id);
}

/**
 * Aprovação final. Normalmente sai de AGUARDANDO_APROVACAO (a proposta transferida); quando o
 * condomínio não tem aprovador, a administradora aprova direto de ABERTO uma proposta em disputa.
 * As demais propostas viram RECUSADA de uma vez.
 */
export async function aprovar(ctx: Contexto, id: string, propostaId: string) {
  const o = await carregarOrdem(ctx, id);
  exigirAprovador(ctx, o);
  const p = proposta(o, propostaId);
  const viaTransferencia = o.status === "AGUARDANDO_APROVACAO" && p.status === "TRANSFERIDA";
  const direta = o.status === "ABERTO" && !o.condominio.aprovadorId && p.status === "ENVIADA";
  if (!viaTransferencia && !direta)
    throw conflito(
      o.status === "ABERTO" || o.status === "AGUARDANDO_APROVACAO"
        ? "PROPOSTA_INVALIDA"
        : "TRANSICAO_INVALIDA",
      "Esta proposta não pode ser aprovada agora.",
    );

  await prisma.$transaction(async (tx) => {
    await tx.proposta.updateMany({
      where: { ordemId: id, id: { not: p.id }, status: { not: "CANCELADA" } },
      data: { status: "RECUSADA" },
    });
    await tx.proposta.update({ where: { id: p.id }, data: { status: "ACEITA" } });
    await transicionar(
      tx,
      id,
      o.status,
      "EM_EXECUCAO",
      {
        tipo: "APROVADA",
        texto: `${ctx.usuario.nome} aprovou a proposta de ${p.prestador.razaoSocial}`,
        autorId: ctx.usuario.id,
        marco: true,
      },
      { aprovadoPorId: ctx.usuario.id, aprovadoEm: new Date() },
    );
  });
  return responder(ctx, id);
}

/** Reprova a proposta transferida: ela é recusada e a ordem volta para a administradora. */
export async function reprovar(ctx: Contexto, id: string, propostaId: string, motivo?: string) {
  const o = await carregarOrdem(ctx, id);
  exigirAprovador(ctx, o);
  const p = proposta(o, propostaId);
  if (o.status !== "AGUARDANDO_APROVACAO" || p.status !== "TRANSFERIDA")
    throw conflito(
      "PROPOSTA_NAO_TRANSFERIDA",
      "Só dá para reprovar a proposta transferida para aprovação.",
    );

  await prisma.$transaction(async (tx) => {
    await tx.proposta.update({
      where: { id: p.id },
      data: { status: "RECUSADA", motivoRecusa: motivo ?? null },
    });
    await transicionar(tx, id, "AGUARDANDO_APROVACAO", "ABERTO", {
      tipo: "REPROVADA",
      texto: `${ctx.usuario.nome} reprovou a proposta de ${p.prestador.razaoSocial}${motivo ? `: “${motivo}”` : ""}`,
      autorId: ctx.usuario.id,
      marco: true,
    });
  });
  return responder(ctx, id);
}

export async function whatsapp(ctx: Contexto, id: string) {
  const o = await carregarOrdem(ctx, id);
  exigirGestor(ctx, o);
  const aceita = o.propostas.find((p) => p.status === "ACEITA");
  if (!aceita || (o.status !== "EM_EXECUCAO" && o.status !== "CONCLUIDO"))
    throw conflito(
      "SEM_PROPOSTA_APROVADA",
      "Esta ordem de serviço ainda não tem proposta aprovada.",
    );
  const msg = `Olá! Sua proposta para a ordem de serviço #${o.numero} (${o.titulo}) foi aprovada. Podemos combinar o início do serviço?`;
  return { url: linkWhatsapp(aceita.prestador.telefoneWhatsapp, msg) };
}
