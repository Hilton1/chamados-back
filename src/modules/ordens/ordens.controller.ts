import type { Request, Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { ctx } from "../../middlewares/auth.js";
import * as decisao from "./decisao.service.js";
import { filtroOrdens, novaOrdemInput, propostaIdInput, reprovarInput } from "./ordens.schemas.js";
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

export async function propostas(req: Request, res: Response) {
  res.json(await decisao.listarPropostas(ctx(req), id(req)));
}

export async function transferir(req: Request, res: Response) {
  res.json(await decisao.transferir(ctx(req), id(req), propostaIdInput.parse(req.body).propostaId));
}

export async function aprovar(req: Request, res: Response) {
  res.json(await decisao.aprovar(ctx(req), id(req), propostaIdInput.parse(req.body).propostaId));
}

export async function reprovar(req: Request, res: Response) {
  const { propostaId, motivo } = reprovarInput.parse(req.body);
  res.json(await decisao.reprovar(ctx(req), id(req), propostaId, motivo));
}

export async function whatsapp(req: Request, res: Response) {
  res.json(await decisao.whatsapp(ctx(req), id(req)));
}
