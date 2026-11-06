import { Router, type Request, type Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { ctx, exigirPerfil } from "../../middlewares/auth.js";
import { avaliacaoInput } from "../ordens/ordens.schemas.js";
import * as service from "./avaliacoes.service.js";

export const avaliacoesRoutes = Router();
const internos = exigirPerfil("ADMIN", "SINDICO", "FISCAL", "ZELADOR");

avaliacoesRoutes.post("/ordens/:id/avaliacao", internos, async (req: Request, res: Response) => {
  const { nota, comentario } = avaliacaoInput.parse(req.body);
  res.json(await service.avaliar(ctx(req), idParam.parse(req.params).id, nota, comentario));
});

// Tela de avaliação: quem avalia pode ser o aprovador (qualquer perfil do condomínio).
// Não identifica condomínios, só números agregados.
avaliacoesRoutes.get(
  "/prestadores/:id/historico",
  internos,
  async (req: Request, res: Response) => {
    res.json(await service.historico(idParam.parse(req.params).id));
  },
);
