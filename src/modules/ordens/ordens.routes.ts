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
ordensRoutes.get("/ordens/:id/propostas", internos, c.propostas);
ordensRoutes.post("/ordens/:id/transferir", exigirPerfil("ADMIN"), c.transferir);
// Aprovador pode ter qualquer perfil do condomínio; a regra fica no service.
ordensRoutes.post("/ordens/:id/aprovar", internos, c.aprovar);
ordensRoutes.post("/ordens/:id/reprovar", internos, c.reprovar);
ordensRoutes.get("/ordens/:id/whatsapp", internos, c.whatsapp);
