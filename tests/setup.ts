// Dublê do Clerk para todos os testes: o token é o próprio id do usuário no Clerk
// (`Authorization: Bearer user_x`) e o e-mail verificado vem de `emailsClerk` (tests/helpers/clerk.ts).
import type { Request, RequestHandler } from "express";
import { vi } from "vitest";

vi.mock("../src/lib/clerk.js", () => ({
  clerkSessao: (): RequestHandler => (_req, _res, next) => next(),
  idClerk: (req: Request) => {
    const h = req.get("authorization");
    return h?.startsWith("Bearer ") ? h.slice(7) : null;
  },
  emailVerificado: async (id: string) =>
    (globalThis as { __emailsClerk?: Map<string, string> }).__emailsClerk?.get(id)?.toLowerCase() ??
    null,
}));
