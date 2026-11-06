import { Router } from "express";
import * as c from "./me.controller.js";

/** Montado antes de `exigirConta`: responde também a quem ainda não tem cadastro (404). */
export const meRoutes = Router();
meRoutes.get("/me", c.obter);
