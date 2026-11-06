import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { documento as documentoValido } from "../../lib/validacao.js";
import { AppError } from "../../middlewares/erro.js";
import { validarCategoriasPrestador } from "../categorias/categorias.service.js";
import type {
  CadastroInput,
  Filtro,
  MeuCadastroInput,
  PrestadorInput,
} from "./prestadores.schemas.js";
import { INCLUDE_PRESTADOR, serializarPrestador } from "./prestadores.serializer.js";

const conflito = (codigo: string, msg: string) => new AppError(409, codigo, msg);
const naoEncontrado = () => new AppError(404, "NAO_ENCONTRADO", "Prestador não encontrado.");

/** Serviços concluídos (ordem CONCLUIDO com a proposta dele ACEITA), por prestador. */
export async function totaisServicos(ids: string[]) {
  const linhas = await prisma.proposta.groupBy({
    by: ["prestadorId"],
    where: { prestadorId: { in: ids }, status: "ACEITA", ordem: { status: "CONCLUIDO" } },
    _count: { _all: true },
  });
  return new Map(linhas.map((l) => [l.prestadorId, l._count._all]));
}

async function serializarUm(id: string) {
  const p = await prisma.prestador.findUnique({ where: { id }, include: INCLUDE_PRESTADOR });
  if (!p) throw naoEncontrado();
  return serializarPrestador(p, (await totaisServicos([id])).get(id) ?? 0);
}

const situacao = (p: { ativo: boolean; status: string }) =>
  !p.ativo ? "INATIVO" : p.status === "PENDENTE" ? "PENDENTE" : "ATIVO";
const PESO = { PENDENTE: 0, ATIVO: 1, INATIVO: 2 } as const;

export async function listar(f: Filtro) {
  const where: Prisma.PrestadorWhereInput = {};
  if (f.situacao === "INATIVO") where.ativo = false;
  if (f.situacao === "ATIVO") Object.assign(where, { ativo: true, status: "APROVADO" });
  if (f.situacao === "PENDENTE") Object.assign(where, { ativo: true, status: "PENDENTE" });
  if (f.categoriaId) where.categorias = { some: { categoriaId: f.categoriaId } };
  if (f.busca) {
    const digitos = f.busca.replace(/\D/g, "");
    where.OR = [
      { razaoSocial: { contains: f.busca, mode: "insensitive" } },
      { usuario: { nome: { contains: f.busca, mode: "insensitive" } } },
      ...(digitos ? [{ documento: { contains: digitos } }] : []),
    ];
  }
  const lista = await prisma.prestador.findMany({ where, include: INCLUDE_PRESTADOR });
  const totais = await totaisServicos(lista.map((p) => p.id));
  return lista
    .sort(
      (a, b) =>
        PESO[situacao(a)] - PESO[situacao(b)] ||
        a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR"),
    )
    .map((p) => serializarPrestador(p, totais.get(p.id) ?? 0));
}

export const obter = serializarUm;

async function garantirUnicos(dados: { documento: string; email?: string }, prestadorId?: string) {
  const doc = await prisma.prestador.findFirst({
    where: { documento: dados.documento, ...(prestadorId && { id: { not: prestadorId } }) },
  });
  if (doc) throw conflito("DOCUMENTO_DUPLICADO", "Já existe um prestador com este CPF/CNPJ.");
  if (dados.email) {
    const conta = await prisma.usuario.findUnique({
      where: { email: dados.email },
      include: { prestador: { select: { id: true } } },
    });
    if (conta && (!prestadorId || conta.prestador?.id !== prestadorId))
      throw conflito("EMAIL_DUPLICADO", "Já existe uma conta com este e-mail.");
  }
}

const dadosPrestador = (i: MeuCadastroInput) => ({
  razaoSocial: i.razaoSocial,
  telefoneWhatsapp: i.telefoneWhatsapp,
  emiteNotaFiscal: i.emiteNotaFiscal,
  areaAtuacao: i.areaAtuacao,
});

const categoriasCreate = (ids: string[]) => ({
  create: [...new Set(ids)].map((categoriaId) => ({ categoriaId })),
});

/** Cadastro pela administradora: já entra aprovado; a conta se liga pelo e-mail no 1º login. */
export async function criar(input: PrestadorInput, adminId: string) {
  if (!input.emiteNotaFiscal)
    throw conflito(
      "SEM_NOTA_FISCAL",
      "A administradora só cadastra prestadores que emitem nota fiscal.",
    );
  await validarCategoriasPrestador(input.categoriaIds);
  await garantirUnicos(input);
  const p = await prisma.prestador.create({
    data: {
      ...dadosPrestador(input),
      documento: input.documento,
      status: "APROVADO",
      origem: "ADMINISTRADORA",
      aprovadoPor: { connect: { id: adminId } },
      aprovadoEm: new Date(),
      usuario: {
        create: { nome: input.nomeContato, email: input.email, telefone: input.telefoneWhatsapp },
      },
      categorias: categoriasCreate(input.categoriaIds),
    },
  });
  return serializarUm(p.id);
}

async function atualizarCadastro(
  id: string,
  input: MeuCadastroInput & { documento?: string; email?: string },
) {
  const atual = await prisma.prestador.findUnique({ where: { id }, include: INCLUDE_PRESTADOR });
  if (!atual) throw naoEncontrado();
  await validarCategoriasPrestador(
    input.categoriaIds,
    atual.categorias.map((c) => c.categoriaId),
  );
  if (input.documento !== undefined) {
    const digitos = input.documento.replace(/\D/g, "");
    // Documento já gravado continua valendo; um novo precisa ter dígitos verificadores corretos.
    if (digitos !== atual.documento && !documentoValido.safeParse(digitos).success)
      throw new AppError(400, "DOCUMENTO_INVALIDO", "CPF ou CNPJ inválido.");
    input.documento = digitos;
  }
  await garantirUnicos({ documento: input.documento ?? atual.documento, email: input.email }, id);
  await prisma.$transaction([
    prisma.prestadorCategoria.deleteMany({ where: { prestadorId: id } }),
    prisma.prestador.update({
      where: { id },
      data: {
        ...dadosPrestador(input),
        ...(input.documento && { documento: input.documento }),
        categorias: categoriasCreate(input.categoriaIds),
        usuario: {
          update: { nome: input.nomeContato, ...(input.email && { email: input.email }) },
        },
      },
    }),
  ]);
  return serializarUm(id);
}

export const atualizar = (id: string, input: PrestadorInput) => atualizarCadastro(id, { ...input });

export async function aprovar(id: string, adminId: string) {
  const p = await prisma.prestador.findUnique({ where: { id } });
  if (!p) throw naoEncontrado();
  if (!p.emiteNotaFiscal)
    throw conflito("SEM_NOTA_FISCAL", "Só é possível aprovar quem emite nota fiscal.");
  if (p.status !== "APROVADO")
    await prisma.prestador.update({
      where: { id },
      data: { status: "APROVADO", aprovadoPorId: adminId, aprovadoEm: new Date() },
    });
  return serializarUm(id);
}

/** Soft delete: some do mural e das buscas; histórico e ordens antigas continuam. */
export async function desativar(id: string, motivo?: string) {
  if (!(await prisma.prestador.findUnique({ where: { id } }))) throw naoEncontrado();
  await prisma.prestador.update({
    where: { id },
    data: { ativo: false, motivoInativacao: motivo || null },
  });
  return serializarUm(id);
}

export async function reativar(id: string) {
  if (!(await prisma.prestador.findUnique({ where: { id } }))) throw naoEncontrado();
  await prisma.prestador.update({ where: { id }, data: { ativo: true, motivoInativacao: null } });
  return serializarUm(id);
}

/**
 * Autocadastro: cria o prestador PENDENTE ligado à conta do Clerk. Quem ainda não tem conta no banco
 * ganha uma com o e-mail verificado; quem já tem (ex.: síndico que também presta serviço) ganha o perfil.
 */
export async function autocadastro(
  input: CadastroInput,
  clerkUserId: string,
  contaId: string | null,
  emailConta: string | null,
) {
  await validarCategoriasPrestador(input.categoriaIds);
  if (contaId && (await prisma.prestador.findUnique({ where: { usuarioId: contaId } })))
    throw conflito("JA_CADASTRADO", "Você já tem cadastro de prestador.");
  if (!contaId && !emailConta)
    throw new AppError(403, "EMAIL_NAO_VERIFICADO", "Confirme seu e-mail antes de se cadastrar.");
  await garantirUnicos({ documento: input.documento, email: contaId ? undefined : emailConta! });

  const usuario = contaId
    ? { connect: { id: contaId } }
    : {
        create: {
          clerkUserId,
          email: emailConta!,
          nome: input.nomeContato,
          telefone: input.telefoneWhatsapp,
        },
      };
  const p = await prisma.prestador.create({
    data: {
      ...dadosPrestador(input),
      documento: input.documento,
      status: "PENDENTE",
      origem: "AUTOCADASTRO",
      usuario,
      categorias: categoriasCreate(input.categoriaIds),
    },
  });
  return serializarUm(p.id);
}

export const atualizarMeu = (id: string, input: MeuCadastroInput) => atualizarCadastro(id, input);
