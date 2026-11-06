import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

// Pública. Consulta o banco de propósito: o ping agendado mantém a API (Render) e o
// Supabase acordados ao mesmo tempo.
export const healthRoutes = Router().get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", banco: "ok", uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ status: "degradado", banco: "indisponivel" });
  }
});
