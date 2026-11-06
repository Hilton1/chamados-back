import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middlewares/erro.js";
import type { PessoaInput } from "./pessoas.schemas.js";
import { INCLUDE_PESSOA, serializarPessoa } from "./pessoas.serializer.js";

const conflito = (codigo: string, msg: string) => new AppError(409, codigo, msg);
const naoEncontrada = () => new AppError(404, "NAO_ENCONTRADO", "Pessoa não encontrada.");

/** Pessoas = contas do lado do condomínio/administradora (as contas de prestador ficam em /prestadores). */
const ehPessoa = { prestador: { is: null } } as const;

export async function listar() {
  const lista = await prisma.usuario.findMany({
    where: ehPessoa,
    include: INCLUDE_PESSOA,
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
  return lista.map(serializarPessoa);
}

async function buscar(id: string) {
  const p = await prisma.usuario.findFirst({ where: { id, ...ehPessoa }, include: INCLUDE_PESSOA });
  if (!p) throw naoEncontrada();
  return p;
}

export const obter = async (id: string) => serializarPessoa(await buscar(id));

async function validar(input: PessoaInput, id?: string) {
  if (!input.administradora && input.vinculos.length === 0)
    throw new AppError(
      400,
      "SEM_ACESSO",
      "Vincule a pessoa a pelo menos um condomínio ou marque que ela é da administradora.",
    );
  const outro = await prisma.usuario.findFirst({
    where: { email: input.email, ...(id && { id: { not: id } }) },
  });
  if (outro) throw conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  const ids = input.vinculos.map((v) => v.condominioId);
  if ((await prisma.condominio.count({ where: { id: { in: ids } } })) !== ids.length)
    throw new AppError(400, "CONDOMINIO_INVALIDO", "Condomínio do vínculo não encontrado.");
}

export async function criar(input: PessoaInput) {
  await validar(input);
  const { vinculos, ...dados } = input;
  const p = await prisma.usuario.create({
    data: { ...dados, telefone: dados.telefone ?? null, vinculos: { create: vinculos } },
    include: INCLUDE_PESSOA,
  });
  return serializarPessoa(p);
}

export async function atualizar(id: string, input: PessoaInput, quemEdita: string) {
  await buscar(id);
  await validar(input, id);
  if (id === quemEdita && (!input.ativo || !input.administradora))
    throw conflito(
      "PROPRIA_CONTA",
      "Você não pode desativar nem tirar da administradora a sua própria conta.",
    );

  // Quem aprova num condomínio precisa continuar ativo e vinculado a ele.
  const quebradas = await prisma.condominio.findMany({
    where: {
      aprovadorId: id,
      ...(input.ativo && { id: { notIn: input.vinculos.map((v) => v.condominioId) } }),
    },
    select: { nome: true },
  });
  if (quebradas.length)
    throw conflito(
      "PESSOA_E_APROVADORA",
      `Esta pessoa é quem aprova as propostas de ${quebradas.map((c) => c.nome).join(", ")}. Escolha outra pessoa no cadastro do condomínio antes.`,
    );

  const { vinculos, ...dados } = input;
  const p = await prisma.$transaction(async (tx) => {
    await tx.vinculoCondominio.deleteMany({ where: { usuarioId: id } });
    return tx.usuario.update({
      where: { id },
      data: { ...dados, telefone: dados.telefone ?? null, vinculos: { create: vinculos } },
      include: INCLUDE_PESSOA,
    });
  });
  return serializarPessoa(p);
}
