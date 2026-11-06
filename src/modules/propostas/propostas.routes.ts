import { Router } from "express";
import { exigirPerfil } from "../../middlewares/auth.js";
import { variosArquivos } from "../../middlewares/upload.js";
import * as c from "./propostas.controller.js";

export const propostasRoutes = Router();
const prestador = exigirPerfil("PRESTADOR");

propostasRoutes.get("/mural", prestador, c.mural);
propostasRoutes.get("/propostas/minhas", prestador, c.minhas);
// Upsert: cria ou edita a proposta do prestador nesta ordem; arquivos no mesmo envio (até 5).
propostasRoutes.post("/ordens/:id/propostas", prestador, variosArquivos("arquivos", 5), c.enviar);
propostasRoutes.patch("/propostas/:id/cancelar", prestador, c.cancelar);
