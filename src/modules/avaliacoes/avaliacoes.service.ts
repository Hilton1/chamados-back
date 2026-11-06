// Avaliação do prestador (nota geral 1–5, uma por ordem concluída) e o histórico mostrado na tela
// de avaliação. A média e o total ficam desnormalizados em `prestadores` e são recalculados na mesma
// transação que grava a avaliação.
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { Contexto } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import { registrarEvento } from "../ordens/estado.js";
import { carregarOrdem, exigirGestor } from "../ordens/ordens.escopo.js";
import { responder } from "../ordens/ordens.service.js";

const jaAvaliada = () => new AppError(409, "JA_AVALIADA", "Esta ordem de serviço já foi avaliada.");

export async function avaliar(ctx: Contexto, id: string, nota: number, comentario?: string) {
  const o = await carregarOrdem(ctx, id);
  exigirGestor(ctx, o);
  if (o.status !== "CONCLUIDO")
    throw new AppError(
      409,
      "TRANSICAO_INVALIDA",
      "Só dá para avaliar uma ordem de serviço concluída.",
    );
  if (o.avaliacao) throw jaAvaliada();
  const aceita = o.propostas.find((p) => p.status === "ACEITA");
  if (!aceita)
    throw new AppError(
      409,
      "SEM_PROPOSTA_APROVADA",
      "Esta ordem de serviço não tem prestador aprovado.",
    );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.avaliacao.create({
        data: {
          ordemId: o.id,
          prestadorId: aceita.prestadorId,
          avaliadorId: ctx.usuario.id,
          nota,
          comentario: comentario ?? null,
        },
      });
      const agg = await tx.avaliacao.aggregate({
        where: { prestadorId: aceita.prestadorId },
        _avg: { nota: true },
        _count: { _all: true },
      });
      await tx.prestador.update({
        where: { id: aceita.prestadorId },
        data: {
          mediaAvaliacao: new Prisma.Decimal((agg._avg.nota ?? 0).toFixed(2)),
          totalAvaliacoes: agg._count._all,
        },
      });
      await registrarEvento(tx, o.id, {
        tipo: "AVALIADO",
        texto: `Prestador avaliado com nota ${nota}`,
        autorId: ctx.usuario.id,
      });
    });
  } catch (err) {
    // Duas avaliações ao mesmo tempo: o índice único em avaliacoes.ordem_id barra a segunda.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      throw jaAvaliada();
    throw err;
  }
  return responder(ctx, id);
}

const HORA = 3_600_000;

/**
 * Painel "Histórico deste prestador". Serviços = ordens CONCLUIDO com a proposta dele ACEITA.
 * Prazo cumprido = concluída até `disponivel_em + tempo_execucao_horas` da proposta aceita.
 */
export async function historico(prestadorId: string) {
  const prestador = await prisma.prestador.findUnique({ where: { id: prestadorId } });
  if (!prestador) throw new AppError(404, "NAO_ENCONTRADO", "Prestador não encontrado.");
  const servicos = await prisma.proposta.findMany({
    where: { prestadorId, status: "ACEITA", ordem: { status: "CONCLUIDO" } },
    include: {
      ordem: {
        select: {
          concluidoEm: true,
          categorias: { select: { categoria: { select: { nome: true } } } },
        },
      },
    },
  });

  const porCategoria = new Map<string, number>();
  let cumpridos = 0;
  let ultimo: Date | undefined;
  for (const s of servicos) {
    for (const c of s.ordem.categorias)
      porCategoria.set(c.categoria.nome, (porCategoria.get(c.categoria.nome) ?? 0) + 1);
    const fim = s.ordem.concluidoEm;
    if (fim && fim.getTime() <= s.disponivelEm.getTime() + s.tempoExecucaoHoras * HORA) cumpridos++;
    if (fim && (!ultimo || fim > ultimo)) ultimo = fim;
  }
  return {
    media: Number(prestador.mediaAvaliacao),
    totalServicos: servicos.length,
    porCategoria: [...porCategoria]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria, "pt-BR")),
    prazoCumprido: { cumpridos, total: servicos.length },
    ultimoServicoEm: ultimo?.toISOString(),
  };
}
