// Ponto único de contato com o Clerk. Os testes trocam este módulo por um dublê (tests/setup.ts),
// então nenhuma outra parte do código importa `@clerk/express` direto.
import { clerkMiddleware, createClerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { env } from "../config/env.js";

const clerk = createClerkClient({
  secretKey: env.CLERK_SECRET_KEY,
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
});

/** Valida o token da sessão (`Authorization: Bearer`). Só aceita tokens emitidos para o front. */
export const clerkSessao = (): RequestHandler =>
  clerkMiddleware({
    clerkClient: clerk,
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    authorizedParties: env.FRONTEND_URL,
  });

/** `userId` do Clerk na requisição, ou `null` sem sessão válida. */
export const idClerk = (req: Request): string | null => getAuth(req).userId ?? null;

/**
 * E-mail principal **verificado** da conta no Clerk (minúsculo), ou `null`.
 * Só ele serve para casar a conta com o pré-cadastro: e-mail não verificado poderia ser de outra pessoa.
 */
export async function emailVerificado(userId: string): Promise<string | null> {
  const u = await clerk.users.getUser(userId);
  const principal = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
  if (!principal || principal.verification?.status !== "verified") return null;
  return principal.emailAddress.toLowerCase();
}
