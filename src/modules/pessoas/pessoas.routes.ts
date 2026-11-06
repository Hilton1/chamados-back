import { Router } from "express";
import { exigirPerfil } from "../../middlewares/auth.js";
import * as c from "./pessoas.controller.js";

/** Cadastro de pessoas (administradora, síndicos, fiscais, zeladores): só a administradora. */
export const pessoasRoutes = Router();
const admin = exigirPerfil("ADMIN");
pessoasRoutes.get("/pessoas", admin, c.listar);
pessoasRoutes.post("/pessoas", admin, c.criar);
pessoasRoutes.get("/pessoas/:id", admin, c.obter);
pessoasRoutes.patch("/pessoas/:id", admin, c.atualizar);
