import type { Request, Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { ctx } from "../../middlewares/auth.js";
import { filtroOrdens, novaOrdemInput } from "./ordens.schemas.js";
import * as service from "./ordens.service.js";

const id = (req: Request) => idParam.parse(req.params).id;

export async function listar(req: Request, res: Response) {
  res.json(await service.listar(ctx(req), filtroOrdens.parse(req.query)));
}

export async function obter(req: Request, res: Response) {
  res.json(await service.obter(ctx(req), id(req)));
}

export async function criar(req: Request, res: Response) {
  res.status(201).json(await service.criar(ctx(req), novaOrdemInput.parse(req.body)));
}

export async function cancelar(req: Request, res: Response) {
  res.json(await service.cancelar(ctx(req), id(req)));
}
