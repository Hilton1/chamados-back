import type { Request, Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { categoriaInput, listarQuery } from "./categorias.schemas.js";
import * as service from "./categorias.service.js";

export async function listar(req: Request, res: Response) {
  const { todas } = listarQuery.parse(req.query);
  res.json(await service.listar(!!todas));
}

export async function criar(req: Request, res: Response) {
  res.status(201).json(await service.criar(categoriaInput.parse(req.body)));
}

export async function atualizar(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await service.atualizar(id, categoriaInput.parse(req.body)));
}

export async function uso(_req: Request, res: Response) {
  res.json(await service.uso());
}
