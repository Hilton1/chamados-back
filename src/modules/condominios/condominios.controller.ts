import type { Request, Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { condominioInput } from "./condominios.schemas.js";
import * as service from "./condominios.service.js";

export async function listar(_req: Request, res: Response) {
  res.json(await service.listar());
}

export async function obter(req: Request, res: Response) {
  res.json(await service.obter(idParam.parse(req.params).id));
}

export async function criar(req: Request, res: Response) {
  res.status(201).json(await service.criar(condominioInput.parse(req.body)));
}

export async function atualizar(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await service.atualizar(id, condominioInput.parse(req.body)));
}
