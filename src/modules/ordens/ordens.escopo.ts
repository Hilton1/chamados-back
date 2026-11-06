// Quem enxerga e quem age em cada ordem de serviço (LGPD: escopo por condomínio).
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { Contexto } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import { INCLUDE_ORDEM, type OrdemCompleta, type Visao } from "./ordens.serializer.js";

export const ordemNaoEncontrada = () =>
  new AppError(404, "NAO_ENCONTRADO", "Ordem de serviço não encontrada.");

/** Ordens que o perfil ativo (não prestador) enxerga. */
export function whereGestao(ctx: Contexto): Prisma.OrdemWhereInput {
  if (ctx.perfil === "ADMIN") return {};
  const ids = ctx.condominioIds ?? [];
  if (ctx.perfil === "ZELADOR")
    // Zelador vê o que abriu e, se for o aprovador do condomínio, o que espera a decisão dele.
    return {
      condominioId: { in: ids },
      OR: [{ criadoPorId: ctx.usuario.id }, { condominio: { aprovadorId: ctx.usuario.id } }],
    };
  return { condominioId: { in: ids } };
}

/** Ordens no mural do prestador: abertas, no prazo, com algum tipo que ele atende. */
export function whereMural(ctx: Contexto): Prisma.OrdemWhereInput | null {
  const p = ctx.usuario.prestador;
  if (!p || p.status !== "APROVADO" || !p.ativo) return null;
  return {
    status: "ABERTO",
    prazoPropostasAte: { gt: new Date() },
    categorias: { some: { categoriaId: { in: p.categorias.map((c) => c.categoriaId) } } },
  };
}

/** Prestador: mural + ordens em que ele tem proposta. */
export function wherePrestador(ctx: Contexto): Prisma.OrdemWhereInput {
  const p = ctx.usuario.prestador!;
  const mural = whereMural(ctx);
  return { OR: [{ propostas: { some: { prestadorId: p.id } } }, ...(mural ? [mural] : [])] };
}

export const visaoDe = (ctx: Contexto): Visao =>
  ctx.perfil === "PRESTADOR"
    ? { tipo: "PRESTADOR", prestadorId: ctx.usuario.prestador!.id }
    : { tipo: "GESTOR" };

export const whereVisivel = (ctx: Contexto) =>
  ctx.perfil === "PRESTADOR" ? wherePrestador(ctx) : whereGestao(ctx);

/** Carrega a ordem se o perfil ativo a enxerga; senão 404 (não revela que existe). */
export async function carregarOrdem(ctx: Contexto, id: string): Promise<OrdemCompleta> {
  const o = await prisma.ordem.findFirst({
    where: { AND: [{ id }, whereVisivel(ctx)] },
    include: INCLUDE_ORDEM,
  });
  if (!o) throw ordemNaoEncontrada();
  return o;
}

/** Quem aprova: a pessoa definida no condomínio ou, sem ela, qualquer pessoa da administradora. */
export const ehAprovador = (ctx: Contexto, condominio: { aprovadorId: string | null }) =>
  condominio.aprovadorId ? condominio.aprovadorId === ctx.usuario.id : ctx.perfil === "ADMIN";

/** Gestor da ordem: administradora, síndico do condomínio (já garantido pelo escopo) ou o aprovador. */
export const ehGestor = (ctx: Contexto, o: { condominio: { aprovadorId: string | null } }) =>
  ctx.perfil === "ADMIN" || ctx.perfil === "SINDICO" || ehAprovador(ctx, o.condominio);

export function exigirGestor(ctx: Contexto, o: OrdemCompleta) {
  if (!ehGestor(ctx, o))
    throw new AppError(
      403,
      "PERFIL_SEM_PERMISSAO",
      "Seu perfil não pode fazer isso nesta ordem de serviço.",
    );
}
