// Banco de teste: limpeza entre testes e fábricas de dados.
import type { PerfilCondominio } from "@prisma/client";
import { prisma } from "../../src/lib/prisma.js";
import { emailsClerk } from "./clerk.js";

export { prisma };

const TABELAS = [
  "avaliacoes",
  "anexos",
  "ordem_eventos",
  "propostas",
  "ordem_categorias",
  "ordens_servico",
  "prestador_categorias",
  "prestadores",
  "vinculos_condominio",
  "condominios",
  "categorias",
  "usuarios",
];

export async function limparBanco() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABELAS.join(", ")} RESTART IDENTITY CASCADE`);
  emailsClerk.clear();
}

let seq = 0;
const n = () => ++seq;

/** CNPJ com dígitos verificadores válidos, diferente a cada chamada. */
export function cnpjValido(): string {
  const base = String(10_000_000 + n()).padStart(8, "0") + "0001";
  const dv = (s: string) => {
    const pesos =
      s.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((t, p, i) => t + p * Number(s[i]), 0) % 11;
    return String(r < 2 ? 0 : 11 - r);
  };
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
}

export async function criarCategoria(
  dados: Partial<{
    nome: string;
    interna: boolean;
    zeladorPodeAbrir: boolean;
    ativa: boolean;
  }> = {},
) {
  const i = n();
  return prisma.categoria.create({
    data: { nome: `Tipo ${i}`, slug: `tipo-${i}`, ...dados },
  });
}

export async function criarCondominio(
  dados: Partial<{ nome: string; ativo: boolean; aprovadorId: string | null }> = {},
) {
  const i = n();
  return prisma.condominio.create({
    data: {
      nome: `Condomínio ${i}`,
      endereco: `Rua ${i}, 100`,
      bairro: "Ponta Verde",
      cidade: "Maceió",
      uf: "AL",
      latitude: -9.66,
      longitude: -35.71,
      ...dados,
    },
  });
}

interface PessoaOpts {
  nome?: string;
  email?: string;
  administradora?: boolean;
  ativo?: boolean;
  vinculos?: { condominioId: string; perfil: PerfilCondominio }[];
  /** id no Clerk; se informado, a conta já está ligada (contaCriada). */
  clerk?: string;
}

export async function criarPessoa(o: PessoaOpts = {}) {
  const i = n();
  return prisma.usuario.create({
    data: {
      nome: o.nome ?? `Pessoa ${i}`,
      email: o.email ?? `pessoa${i}@teste.com`,
      administradora: o.administradora ?? false,
      ativo: o.ativo ?? true,
      clerkUserId: o.clerk ?? null,
      vinculos: { create: o.vinculos ?? [] },
    },
  });
}

interface PrestadorOpts {
  clerk?: string;
  email?: string;
  status?: "PENDENTE" | "APROVADO";
  ativo?: boolean;
  emiteNotaFiscal?: boolean;
  categoriaIds?: string[];
  razaoSocial?: string;
}

export async function criarPrestador(o: PrestadorOpts = {}) {
  const i = n();
  return prisma.prestador.create({
    data: {
      razaoSocial: o.razaoSocial ?? `Prestador ${i}`,
      documento: cnpjValido(),
      telefoneWhatsapp: "5582999990001",
      emiteNotaFiscal: o.emiteNotaFiscal ?? true,
      areaAtuacao: "Maceió",
      status: o.status ?? "APROVADO",
      ativo: o.ativo ?? true,
      usuario: {
        create: {
          nome: `Contato ${i}`,
          email: o.email ?? `prestador${i}@teste.com`,
          clerkUserId: o.clerk ?? null,
        },
      },
      categorias: { create: (o.categoriaIds ?? []).map((categoriaId) => ({ categoriaId })) },
    },
    include: { usuario: true },
  });
}

interface OrdemOpts {
  condominioId: string;
  criadoPorId: string;
  categoriaIds: string[];
  perfilCriador?: "ADMIN" | "SINDICO" | "FISCAL" | "ZELADOR";
  status?: "ABERTO" | "AGUARDANDO_APROVACAO" | "EM_EXECUCAO" | "CONCLUIDO" | "CANCELADO";
  urgencia?: "NORMAL" | "URGENTE";
  exigeNotaFiscal?: boolean;
  /** Horas até o fim do prazo de propostas (negativo = já encerrado). */
  prazoHoras?: number;
  titulo?: string;
}

/** Ordem de serviço gravada direto (para montar cenários em qualquer situação). */
export async function criarOrdem(o: OrdemOpts) {
  const i = n();
  return prisma.ordem.create({
    data: {
      condominioId: o.condominioId,
      criadoPorId: o.criadoPorId,
      perfilCriador: o.perfilCriador ?? "ADMIN",
      titulo: o.titulo ?? `Ordem ${i}`,
      descricao: "Descrição do problema",
      local: "Bloco A",
      urgencia: o.urgencia ?? "NORMAL",
      status: o.status ?? "ABERTO",
      exigeNotaFiscal: o.exigeNotaFiscal ?? false,
      prazoPropostasAte: new Date(Date.now() + (o.prazoHoras ?? 48) * 3_600_000),
      categorias: { create: o.categoriaIds.map((categoriaId) => ({ categoriaId })) },
    },
  });
}

export async function criarProposta(o: {
  ordemId: string;
  prestadorId: string;
  valor?: number;
  status?: "ENVIADA" | "TRANSFERIDA" | "ACEITA" | "RECUSADA" | "CANCELADA";
  tempoExecucaoHoras?: number;
  disponivelEm?: Date;
}) {
  return prisma.proposta.create({
    data: {
      ordemId: o.ordemId,
      prestadorId: o.prestadorId,
      valor: o.valor ?? 500,
      disponivelEm: o.disponivelEm ?? new Date(Date.now() + 24 * 3_600_000),
      tempoExecucaoHoras: o.tempoExecucaoHoras ?? 4,
      status: o.status ?? "ENVIADA",
    },
  });
}
