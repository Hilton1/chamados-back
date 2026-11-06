import type { Request, Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { ctx } from "../../middlewares/auth.js";
import { pessoaInput } from "./pessoas.schemas.js";
import * as service from "./pessoas.service.js";

export async function listar(_req: Request, res: Response) {
  res.json(await service.listar());
}

export async function obter(req: Request, res: Response) {
  res.json(await service.obter(idParam.parse(req.params).id));
}

export async function criar(req: Request, res: Response) {
  res.status(201).json(await service.criar(pessoaInput.parse(req.body)));
}

export async function atualizar(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await service.atualizar(id, pessoaInput.parse(req.body), ctx(req).usuario.id));
}
