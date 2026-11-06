import type { Request, Response } from "express";
import { contaDesativada } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import * as service from "./me.service.js";

export async function obter(req: Request, res: Response) {
  const conta = req.conta;
  // 404 = sessão válida sem cadastro: o front leva ao autocadastro do prestador.
  if (!conta) throw new AppError(404, "SEM_CADASTRO", "Cadastro não encontrado.");
  if (contaDesativada(conta))
    throw new AppError(
      403,
      "ACESSO_DESATIVADO",
      "Seu acesso está desativado. Fale com a administradora.",
    );
  res.json(await service.me(conta));
}
