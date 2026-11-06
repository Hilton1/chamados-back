import type { Request, Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { ctx } from "../../middlewares/auth.js";
import { arquivosDa, validarArquivos } from "../../middlewares/upload.js";
import { propostaInput } from "./propostas.schemas.js";
import * as service from "./propostas.service.js";

const id = (req: Request) => idParam.parse(req.params).id;

export async function mural(req: Request, res: Response) {
  res.json(await service.mural(ctx(req)));
}

export async function minhas(req: Request, res: Response) {
  res.json(await service.minhas(ctx(req)));
}

export async function enviar(req: Request, res: Response) {
  const input = propostaInput.parse(req.body ?? {});
  const arquivos = await validarArquivos(arquivosDa(req), "PROPOSTA");
  res.json(await service.enviar(ctx(req), id(req), input, arquivos));
}

export async function cancelar(req: Request, res: Response) {
  res.json(await service.cancelar(ctx(req), id(req)));
}
