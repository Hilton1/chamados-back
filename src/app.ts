import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { naoEncontrado, tratarErro } from "./middlewares/erro.js";
import { healthRoutes } from "./modules/health/health.routes.js";

export function criarApp() {
  const app = express();

  app.set("trust proxy", 1); // Render/Koyeb ficam atrás de proxy (IP real e HTTPS)
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  const api = express.Router();
  api.use(healthRoutes);
  // Etapa 1+: clerkMiddleware, carregarUsuario e rotas dos módulos entram aqui (ver TASKS.md).

  app.use("/api", api);
  app.use(naoEncontrado);
  app.use(tratarErro);
  return app;
}
