// Autenticação e perfil ativo.
//
//   autenticar   → sessão Clerk obrigatória (401); carrega a conta (`req.conta`, null = sem cadastro).
//                  No 1º login de quem foi pré-cadastrado, casa pelo e-mail VERIFICADO e grava o clerk_user_id.
//   exigirConta  → conta ativa com algum perfil (403); resolve o perfil ativo pelo cabeçalho `X-Perfil`
//                  e monta `req.ctx` (perfil + escopo de condomínios).
//   exigirPerfil → restringe a rota a perfis ativos específicos (403).
import type { Prisma } from "@prisma/client";
import type { Request, RequestHandler } from "express";
import { emailVerificado, idClerk } from "../lib/clerk.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./erro.js";

export type Perfil = "ADMIN" | "SINDICO" | "FISCAL" | "ZELADOR" | "PRESTADOR";

export const INCLUDE_CONTA = {
  vinculos: {
    include: { condominio: { include: { aprovador: { select: { id: true, nome: true } } } } },
  },
  prestador: { include: { categorias: { select: { categoriaId: true } } } },
} satisfies Prisma.UsuarioInclude;

export type Conta = Prisma.UsuarioGetPayload<{ include: typeof INCLUDE_CONTA }>;

export interface Contexto {
  usuario: Conta;
  perfil: Perfil;
  perfis: Perfil[];
  /** Condomínios em que a pessoa atua com o perfil ativo. `null` = todos (ADMIN). PRESTADOR: []. */
  condominioIds: string[] | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clerkUserId?: string;
      conta?: Conta | null;
      ctx?: Contexto;
    }
  }
}

const ORDEM_PERFIS = ["SINDICO", "FISCAL", "ZELADOR"] as const;

/** Mesma ordem do front (lib/contexto.ts → perfisDe): o primeiro é o padrão. */
export function perfisDe(conta: Conta): Perfil[] {
  const out: Perfil[] = [];
  if (conta.administradora) out.push("ADMIN");
  for (const p of ORDEM_PERFIS) if (conta.vinculos.some((v) => v.perfil === p)) out.push(p);
  if (conta.prestador) out.push("PRESTADOR");
  return out;
}

async function carregarConta(clerkUserId: string): Promise<Conta | null> {
  const conta = await prisma.usuario.findUnique({ where: { clerkUserId }, include: INCLUDE_CONTA });
  if (conta) return conta;

  // 1º login: liga a conta do Clerk ao pré-cadastro com o mesmo e-mail (só se ainda não estiver ligado).
  const email = await emailVerificado(clerkUserId);
  if (!email) return null;
  const { count } = await prisma.usuario.updateMany({
    where: { email, clerkUserId: null },
    data: { clerkUserId },
  });
  if (count === 0) return null;
  return prisma.usuario.findUnique({ where: { clerkUserId }, include: INCLUDE_CONTA });
}

export const autenticar: RequestHandler = async (req, _res, next) => {
  const userId = idClerk(req);
  if (!userId)
    throw new AppError(
      401,
      "NAO_AUTENTICADO",
      // Com token que o Clerk não aceitou (vencido, revogado, de outra origem) = sessão expirada.
      req.get("authorization")
        ? "Sua sessão expirou. Entre novamente."
        : "Faça login para continuar.",
    );
  req.clerkUserId = userId;
  req.conta = await carregarConta(userId);
  next();
};

/** Conta desativada (pessoa) ou prestador desativado sem outro perfil. */
export function contaDesativada(conta: Conta) {
  if (!conta.ativo) return true;
  const soPrestador = perfisDe(conta).every((p) => p === "PRESTADOR");
  return !!conta.prestador && !conta.prestador.ativo && soPrestador;
}

const DESATIVADO = () =>
  new AppError(403, "ACESSO_DESATIVADO", "Seu acesso está desativado. Fale com a administradora.");

export const exigirConta: RequestHandler = (req, _res, next) => {
  const conta = req.conta;
  if (!conta) throw new AppError(403, "SEM_CADASTRO", "Complete seu cadastro para continuar.");
  if (contaDesativada(conta)) throw DESATIVADO();

  const perfis = perfisDe(conta);
  // O perfil pedido só vale se a pessoa o tiver; senão cai no padrão (igual ao front).
  const pedido = req.get("x-perfil")?.toUpperCase() as Perfil | undefined;
  const perfil = pedido && perfis.includes(pedido) ? pedido : perfis[0];
  if (!perfil)
    throw new AppError(403, "SEM_ACESSO", "Sua conta não está vinculada a nenhum condomínio.");
  if (perfil === "PRESTADOR" && !conta.prestador?.ativo) throw DESATIVADO();

  req.ctx = {
    usuario: conta,
    perfil,
    perfis,
    condominioIds:
      perfil === "ADMIN"
        ? null
        : conta.vinculos.filter((v) => v.perfil === perfil).map((v) => v.condominioId),
  };
  next();
};

export const exigirPerfil =
  (...perfis: Perfil[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.ctx || !perfis.includes(req.ctx.perfil))
      throw new AppError(403, "PERFIL_SEM_PERMISSAO", "Seu perfil não tem acesso a esta ação.");
    next();
  };

/** Contexto já resolvido por `exigirConta` (use só em rotas montadas depois dele). */
export function ctx(req: Request): Contexto {
  if (!req.ctx) throw new AppError(403, "SEM_CADASTRO", "Complete seu cadastro para continuar.");
  return req.ctx;
}
