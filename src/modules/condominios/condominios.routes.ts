import { Router } from "express";
import { exigirPerfil } from "../../middlewares/auth.js";
import * as c from "./condominios.controller.js";

/** Cadastro de condomínios: só a administradora. */
export const condominiosRoutes = Router();
const admin = exigirPerfil("ADMIN");
condominiosRoutes.get("/condominios", admin, c.listar);
condominiosRoutes.post("/condominios", admin, c.criar);
condominiosRoutes.get("/condominios/:id", admin, c.obter);
condominiosRoutes.patch("/condominios/:id", admin, c.atualizar);
