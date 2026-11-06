import type { ErrorRequestHandler, RequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";

/** Erro de negócio/HTTP. Vira `{ erro: { codigo, mensagem } }` com o status informado. */
export class AppError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export const naoEncontrado: RequestHandler = (req, _res, next) =>
  next(new AppError(404, "ROTA_NAO_ENCONTRADA", `Rota ${req.method} ${req.path} não existe.`));

export const tratarErro: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      erro: {
        codigo: "VALIDACAO",
        mensagem: "Dados inválidos.",
        campos: err.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
      },
    });
    return;
  }
  if (err instanceof MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ erro: { codigo: err.code, mensagem: err.message } });
    return;
  }
  (req.log ?? logger).error({ err }, "erro não tratado");
  res
    .status(500)
    .json({ erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado no servidor." } });
};
