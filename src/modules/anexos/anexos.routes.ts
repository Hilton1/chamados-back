import type { TipoAnexo } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { idParam } from "../../lib/validacao.js";
import { ctx, exigirPerfil, type Contexto } from "../../middlewares/auth.js";
import { AppError } from "../../middlewares/erro.js";
import {
  arquivosDa,
  umArquivo,
  validarArquivos,
  variosArquivos,
  type ArquivoValidado,
} from "../../middlewares/upload.js";
import * as service from "./anexos.service.js";

type Acao = (c: Contexto, id: string, arquivos: ArquivoValidado[]) => Promise<unknown>;

/** Handler de upload: confere o conteúdo pelo tipo de anexo e chama o service. */
const receber =
  (tipo: TipoAnexo, acao: Acao, obrigatorio = true) =>
  async (req: Request, res: Response) => {
    const id = idParam.parse(req.params).id;
    const recebidos = arquivosDa(req);
    if (obrigatorio && recebidos.length === 0)
      throw new AppError(400, "ARQUIVO_OBRIGATORIO", "Envie o arquivo.");
    res.json(await acao(ctx(req), id, await validarArquivos(recebidos, tipo)));
  };

export const anexosRoutes = Router();
const internos = exigirPerfil("ADMIN", "SINDICO", "FISCAL", "ZELADOR");
const prestador = exigirPerfil("PRESTADOR");

anexosRoutes.post(
  "/ordens/:id/anexos",
  internos,
  umArquivo,
  receber("ABERTURA", service.enviarFoto),
);
anexosRoutes.post(
  "/ordens/:id/formularios",
  internos,
  umArquivo,
  receber("FORMULARIO", service.enviarFormulario),
);
anexosRoutes.post(
  "/ordens/:id/comprovacoes",
  prestador,
  umArquivo,
  receber("COMPROVACAO", service.enviarComprovacao),
);
anexosRoutes.post(
  "/ordens/:id/notas-fiscais",
  prestador,
  umArquivo,
  receber("NOTA_FISCAL", service.enviarNotaFiscal),
);
// Conclusão: multipart com `comprovantes` (o service responde 409 PAGAMENTO_PENDENTE se vier vazio).
anexosRoutes.patch(
  "/ordens/:id/concluir",
  internos,
  variosArquivos("comprovantes", 3),
  receber("PAGAMENTO", service.concluir, false),
);
