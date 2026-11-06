import { Router } from "express";
import { exigirPerfil } from "../../middlewares/auth.js";
import * as c from "./prestadores.controller.js";

/** Autocadastro: qualquer sessão do Clerk (ainda sem conta de prestador). Montado antes de `exigirConta`. */
export const autocadastroRoutes = Router();
autocadastroRoutes.post("/prestadores/cadastro", c.autocadastro);

export const prestadoresRoutes = Router();
const admin = exigirPerfil("ADMIN");
const consulta = exigirPerfil("ADMIN", "SINDICO");
const prestador = exigirPerfil("PRESTADOR");

// "/me" antes de "/:id".
prestadoresRoutes.get("/prestadores/me", prestador, c.obterMeu);
prestadoresRoutes.patch("/prestadores/me", prestador, c.atualizarMeu);

prestadoresRoutes.get("/prestadores", consulta, c.listar);
prestadoresRoutes.post("/prestadores", admin, c.criar);
prestadoresRoutes.get("/prestadores/:id", consulta, c.obter);
prestadoresRoutes.patch("/prestadores/:id", admin, c.atualizar);
prestadoresRoutes.patch("/prestadores/:id/aprovar", admin, c.aprovar);
prestadoresRoutes.patch("/prestadores/:id/desativar", admin, c.desativar);
prestadoresRoutes.patch("/prestadores/:id/reativar", admin, c.reativar);
