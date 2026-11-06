import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { Contexto } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import { registrarEvento, transicionar } from "./estado.js";
import { carregarOrdem, exigirGestor, visaoDe, whereGestao } from "./ordens.escopo.js";
import type { FiltroOrdens, NovaOrdemInput } from "./ordens.schemas.js";
import { INCLUDE_ORDEM, serializarOrdens } from "./ordens.serializer.js";

const HORA = 3_600_000;

/** A ordem no formato do front, como o perfil ativo a vê (com URLs assinadas). */
export async function responder(ctx: Contexto, id: string) {
  const o = await carregarOrdem(ctx, id);
  const [serializada] = await serializarOrdens([o], visaoDe(ctx), true);
  return serializada!;
}

export const obter = responder;

export async function listar(ctx: Contexto, f: FiltroOrdens) {
  const filtros: Prisma.OrdemWhereInput[] = [whereGestao(ctx)];
  if (f.status) filtros.push({ status: f.status });
  if (f.urgencia) filtros.push({ urgencia: f.urgencia });
  if (f.categoriaId) filtros.push({ categorias: { some: { categoriaId: f.categoriaId } } });
  if (f.busca) {
    const numero = /^#?\d+$/.test(f.busca) ? Number(f.busca.replace("#", "")) : undefined;
    filtros.push({
      OR: [
        { titulo: { contains: f.busca, mode: "insensitive" } },
        { local: { contains: f.busca, mode: "insensitive" } },
        ...(numero !== undefined && numero <= 2_147_483_647 ? [{ numero }] : []),
      ],
    });
  }
  const lista = await prisma.ordem.findMany({
    where: { AND: filtros },
    include: INCLUDE_ORDEM,
    // Urgentes primeiro (enum: NORMAL < URGENTE), depois as mais recentes.
    orderBy: [{ urgencia: "desc" }, { createdAt: "desc" }],
  });
  return serializarOrdens(lista, visaoDe(ctx), false);
}

/** Tipo de serviço que o perfil pode escolher (igual a `podeAbrirCategoria` do front). */
function podeAbrirCategoria(
  perfil: Contexto["perfil"],
  c: { ativa: boolean; interna: boolean; zeladorPodeAbrir: boolean },
) {
  if (!c.ativa) return false;
  if (perfil === "ADMIN") return true;
  if (c.interna) return false;
  if (perfil === "ZELADOR") return c.zeladorPodeAbrir;
  return true;
}

export async function criar(ctx: Contexto, input: NovaOrdemInput) {
  const condominio = await prisma.condominio.findUnique({ where: { id: input.condominioId } });
  const noEscopo = ctx.condominioIds === null || ctx.condominioIds.includes(input.condominioId);
  if (!condominio || !noEscopo)
    throw new AppError(403, "CONDOMINIO_INVALIDO", "Você não atua neste condomínio.");
  if (!condominio.ativo)
    throw new AppError(409, "CONDOMINIO_INATIVO", "Este condomínio está inativo.");

  const categorias = await prisma.categoria.findMany({ where: { id: { in: input.categoriaIds } } });
  if (categorias.length !== input.categoriaIds.length)
    throw new AppError(409, "SEM_TIPO", "Escolha pelo menos um tipo de serviço válido.");
  if (categorias.some((c) => !podeAbrirCategoria(ctx.perfil, c)))
    throw new AppError(
      403,
      "TIPO_NAO_PERMITIDO",
      "Seu perfil não pode abrir ordens de serviço de um dos tipos escolhidos.",
    );

  const urgente = input.urgencia === "URGENTE";
  const horas = urgente ? (input.prazoUrgenteHoras ?? 2) : 48;
  const id = await prisma.$transaction(async (tx) => {
    const o = await tx.ordem.create({
      data: {
        condominioId: input.condominioId,
        criadoPorId: ctx.usuario.id,
        perfilCriador: ctx.perfil,
        titulo: input.titulo,
        descricao: input.descricao,
        local: input.local,
        urgencia: input.urgencia,
        exigeNotaFiscal: input.exigeNotaFiscal,
        prazoPropostasAte: new Date(Date.now() + horas * HORA),
        categorias: { create: input.categoriaIds.map((categoriaId) => ({ categoriaId })) },
      },
    });
    await registrarEvento(tx, o.id, {
      tipo: "ABERTO",
      texto: `Aberta por ${ctx.usuario.nome}`,
      autorId: ctx.usuario.id,
      marco: true,
    });
    return o.id;
  });
  return responder(ctx, id);
}

export async function cancelar(ctx: Contexto, id: string) {
  const o = await carregarOrdem(ctx, id);
  exigirGestor(ctx, o);
  if (o.status === "CONCLUIDO" || o.status === "CANCELADO")
    throw new AppError(409, "TRANSICAO_INVALIDA", "Esta ordem de serviço já foi encerrada.");
  await prisma.$transaction((tx) =>
    transicionar(
      tx,
      id,
      o.status,
      "CANCELADO",
      {
        tipo: "CANCELADO",
        texto: `Ordem de serviço cancelada por ${ctx.usuario.nome}`,
        autorId: ctx.usuario.id,
        marco: true,
      },
      { canceladoPorId: ctx.usuario.id, canceladoEm: new Date() },
    ),
  );
  return responder(ctx, id);
}
