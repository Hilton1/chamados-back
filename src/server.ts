import { criarApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const server = criarApp().listen(env.PORT, () => {
  logger.info(`API em http://localhost:${env.PORT}/api (storage: ${env.STORAGE_DRIVER})`);
});

// Render/Docker enviam SIGTERM no deploy: termina as requisições em andamento e fecha o banco.
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    logger.info(`${sinal} recebido, encerrando`);
    server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
  });
}
