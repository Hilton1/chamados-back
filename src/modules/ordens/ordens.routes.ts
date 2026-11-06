import { Router } from "express";
import { exigirPerfil } from "../../middlewares/auth.js";
import * as c from "./ordens.controller.js";

export const ordensRoutes = Router();
/** Pessoas do condomínio/administradora. O prestador usa /mural e /propostas/minhas. */
const internos = exigirPerfil("ADMIN", "SINDICO", "FISCAL", "ZELADOR");

ordensRoutes.get("/ordens", internos, c.listar);
ordensRoutes.post("/ordens", internos, c.criar);
// Detalhe: também para o prestador (mural e as próprias propostas), com a visão restrita.
ordensRoutes.get("/ordens/:id", c.obter);
ordensRoutes.patch("/ordens/:id/cancelar", internos, c.cancelar);
