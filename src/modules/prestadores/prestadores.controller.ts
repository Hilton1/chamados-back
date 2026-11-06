import type { Request, Response } from "express";
import { emailVerificado } from "../../lib/clerk.js";
import { idParam } from "../../lib/validacao.js";
import { ctx } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import {
  cadastroInput,
  desativarInput,
  filtroQuery,
  meuCadastroInput,
  prestadorEdicaoInput,
  prestadorInput,
} from "./prestadores.schemas.js";
import * as service from "./prestadores.service.js";

const id = (req: Request) => idParam.parse(req.params).id;

export async function listar(req: Request, res: Response) {
  res.json(await service.listar(filtroQuery.parse(req.query)));
}

export async function obter(req: Request, res: Response) {
  res.json(await service.obter(id(req)));
}

export async function criar(req: Request, res: Response) {
  res.status(201).json(await service.criar(prestadorInput.parse(req.body), ctx(req).usuario.id));
}

export async function atualizar(req: Request, res: Response) {
  res.json(await service.atualizar(id(req), prestadorEdicaoInput.parse(req.body)));
}

export async function aprovar(req: Request, res: Response) {
  res.json(await service.aprovar(id(req), ctx(req).usuario.id));
}

export async function desativar(req: Request, res: Response) {
  res.json(await service.desativar(id(req), desativarInput.parse(req.body ?? {}).motivo));
}

export async function reativar(req: Request, res: Response) {
  res.json(await service.reativar(id(req)));
}

export async function autocadastro(req: Request, res: Response) {
  const input = cadastroInput.parse(req.body);
  const conta = req.conta ?? null;
  if (conta && !conta.ativo)
    throw new AppError(
      403,
      "ACESSO_DESATIVADO",
      "Seu acesso está desativado. Fale com a administradora.",
    );
  const email = conta ? conta.email : await emailVerificado(req.clerkUserId!);
  res
    .status(201)
    .json(await service.autocadastro(input, req.clerkUserId!, conta?.id ?? null, email));
}

function meuId(req: Request) {
  const p = ctx(req).usuario.prestador;
  if (!p) throw new AppError(404, "NAO_ENCONTRADO", "Cadastro de prestador não encontrado.");
  return p.id;
}

export async function obterMeu(req: Request, res: Response) {
  res.json(await service.obter(meuId(req)));
}

export async function atualizarMeu(req: Request, res: Response) {
  res.json(await service.atualizarMeu(meuId(req), meuCadastroInput.parse(req.body)));
}
