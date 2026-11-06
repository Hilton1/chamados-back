import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { clerkSessao } from "./lib/clerk.js";
import { autenticar, exigirConta } from "./middlewares/auth.js";
import { naoEncontrado, tratarErro } from "./middlewares/erro.js";
import {
  categoriasPublicasRoutes,
  categoriasRoutes,
} from "./modules/categorias/categorias.routes.js";
import { condominiosRoutes } from "./modules/condominios/condominios.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { meRoutes } from "./modules/me/me.routes.js";
import { pessoasRoutes } from "./modules/pessoas/pessoas.routes.js";
import { autocadastroRoutes, prestadoresRoutes } from "./modules/prestadores/prestadores.routes.js";

export function criarApp() {
  const app = express();

  app.set("trust proxy", 1); // Render/Koyeb ficam atrás de proxy (IP real e HTTPS)
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type", "X-Perfil"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  const api = express.Router();
  api.use(healthRoutes); // público

  // Daqui em diante: sessão do Clerk obrigatória (401) e conta carregada em req.conta.
  api.use(clerkSessao(), autenticar);
  // Rotas para quem ainda pode não ter cadastro.
  api.use(meRoutes, autocadastroRoutes, categoriasPublicasRoutes);

  // Daqui em diante: conta ativa + perfil ativo (X-Perfil) em req.ctx.
  api.use(exigirConta);
  api.use(categoriasRoutes, condominiosRoutes, pessoasRoutes, prestadoresRoutes);

  app.use("/api", api);
  app.use(naoEncontrado);
  app.use(tratarErro);
  return app;
}
