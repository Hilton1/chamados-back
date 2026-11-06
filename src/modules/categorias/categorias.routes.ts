import { Router } from "express";
import { exigirConta, exigirPerfil } from "../../middlewares/auth.js";
import * as c from "./categorias.controller.js";

/** Leitura vale para qualquer sessão (o autocadastro do prestador escolhe os tipos antes de ter conta). */
export const categoriasPublicasRoutes = Router();
categoriasPublicasRoutes.get("/categorias", c.listar);

export const categoriasRoutes = Router();
const admin = [exigirConta, exigirPerfil("ADMIN")];
categoriasRoutes.get("/categorias/uso", ...admin, c.uso);
categoriasRoutes.post("/categorias", ...admin, c.criar);
categoriasRoutes.patch("/categorias/:id", ...admin, c.atualizar);
