import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middlewares/erro.js";
import type { CondominioInput } from "./condominios.schemas.js";
import { INCLUDE_CONDOMINIO, serializarCondominio } from "./condominios.serializer.js";

const naoEncontrado = () => new AppError(404, "NAO_ENCONTRADO", "Condomínio não encontrado.");
const aprovadorInvalido = () =>
  new AppError(
    409,
    "APROVADOR_INVALIDO",
    "Quem aprova precisa ser uma pessoa ativa vinculada a este condomínio.",
  );

export async function listar() {
  const lista = await prisma.condominio.findMany({
    include: INCLUDE_CONDOMINIO,
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
  return lista.map(serializarCondominio);
}

export async function obter(id: string) {
  const c = await prisma.condominio.findUnique({ where: { id }, include: INCLUDE_CONDOMINIO });
  if (!c) throw naoEncontrado();
  return serializarCondominio(c);
}

async function garantirCnpjLivre(cnpj: string | undefined, id?: string) {
  if (!cnpj) return;
  const outro = await prisma.condominio.findFirst({
    where: { cnpj, ...(id && { id: { not: id } }) },
  });
  if (outro) throw new AppError(409, "CNPJ_DUPLICADO", "Já existe um condomínio com este CNPJ.");
}

const dados = ({ aprovadorId: _a, ...d }: CondominioInput) => ({
  ...d,
  cnpj: d.cnpj ?? null,
  latitude: d.latitude ?? null,
  longitude: d.longitude ?? null,
});

/** Recém-criado ainda não tem pessoas vinculadas: começa com a administradora aprovando. */
export async function criar(input: CondominioInput) {
  if (input.aprovadorId) throw aprovadorInvalido();
  await garantirCnpjLivre(input.cnpj);
  const c = await prisma.condominio.create({ data: dados(input), include: INCLUDE_CONDOMINIO });
  return serializarCondominio(c);
}

export async function atualizar(id: string, input: CondominioInput) {
  if (!(await prisma.condominio.findUnique({ where: { id } }))) throw naoEncontrado();
  await garantirCnpjLivre(input.cnpj, id);
  if (input.aprovadorId) {
    const vinculado = await prisma.vinculoCondominio.findFirst({
      where: { condominioId: id, usuarioId: input.aprovadorId, usuario: { ativo: true } },
    });
    if (!vinculado) throw aprovadorInvalido();
  }
  const c = await prisma.condominio.update({
    where: { id },
    data: { ...dados(input), aprovadorId: input.aprovadorId },
    include: INCLUDE_CONDOMINIO,
  });
  return serializarCondominio(c);
}
