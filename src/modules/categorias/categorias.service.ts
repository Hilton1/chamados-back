import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middlewares/erro.js";
import type { CategoriaInput } from "./categorias.schemas.js";
import { serializarCategoria } from "./categorias.serializer.js";

const slugDe = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export async function listar(todas: boolean) {
  const cats = await prisma.categoria.findMany({
    where: todas ? {} : { ativa: true },
    orderBy: { nome: "asc" },
  });
  return cats.map(serializarCategoria);
}

async function garantirNomeLivre(nome: string, id?: string) {
  const igual = await prisma.categoria.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" }, ...(id && { id: { not: id } }) },
  });
  if (igual)
    throw new AppError(409, "CATEGORIA_DUPLICADA", `Já existe o tipo de serviço "${nome}".`);
}

export async function criar(input: CategoriaInput) {
  await garantirNomeLivre(input.nome);
  const base = slugDe(input.nome) || "tipo";
  let slug = base;
  for (let i = 2; await prisma.categoria.findUnique({ where: { slug } }); i++)
    slug = `${base}-${i}`;
  return serializarCategoria(await prisma.categoria.create({ data: { ...input, slug } }));
}

/** O slug não muda ao renomear (referência estável). */
export async function atualizar(id: string, input: CategoriaInput) {
  if (!(await prisma.categoria.findUnique({ where: { id } })))
    throw new AppError(404, "NAO_ENCONTRADO", "Tipo de serviço não encontrado.");
  await garantirNomeLivre(input.nome, id);
  return serializarCategoria(await prisma.categoria.update({ where: { id }, data: input }));
}

/** Prestadores aprovados e ativos por tipo de serviço: `{ [categoriaId]: total }`. */
export async function uso() {
  const linhas = await prisma.prestadorCategoria.groupBy({
    by: ["categoriaId"],
    where: { prestador: { status: "APROVADO", ativo: true } },
    _count: { _all: true },
  });
  return Object.fromEntries(linhas.map((l) => [l.categoriaId, l._count._all]));
}

/**
 * Confere tipos de serviço escolhidos por/para um prestador: existem e não são de uso interno;
 * os novos (fora de `atuais`) precisam estar ativos.
 */
export async function validarCategoriasPrestador(ids: string[], atuais: string[] = []) {
  const cats = await prisma.categoria.findMany({ where: { id: { in: ids } } });
  const ok =
    cats.length === new Set(ids).size &&
    cats.every((c) => !c.interna && (c.ativa || atuais.includes(c.id)));
  if (!ok)
    throw new AppError(
      400,
      "CATEGORIA_INVALIDA",
      "Escolha tipos de serviço ativos e disponíveis para prestadores.",
    );
}
