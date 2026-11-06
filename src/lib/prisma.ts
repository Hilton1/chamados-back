import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

// Instância única. Em dev, o `tsx watch` recarrega o módulo: guardar no globalThis evita abrir
// uma conexão nova a cada reload.
const global = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  global.prisma ??
  new PrismaClient({ log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (env.NODE_ENV !== "production") global.prisma = prisma;
