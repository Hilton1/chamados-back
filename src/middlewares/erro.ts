import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";
import { rotuloCampo } from "../lib/validacao.js";

/** Erro de negócio/HTTP. Vira `{ erro: { codigo, mensagem } }` com o status informado. */
export class AppError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
    /** Erro original (banco, storage…), só para o log; nunca vai para o cliente. */
    causa?: unknown,
  ) {
    super(mensagem, causa === undefined ? undefined : { cause: causa });
  }
}

export const INDISPONIVEL = "Serviço temporariamente indisponível. Tente novamente em instantes.";

export const naoEncontrado: RequestHandler = (req, _res, next) =>
  next(new AppError(404, "ROTA_NAO_ENCONTRADA", `Rota ${req.method} ${req.path} não existe.`));

// ───────────────────────── Zod ─────────────────────────

/** Mensagem geral da validação: a 1ª falha com o nome do campo ("Nome: use pelo menos 2 caracteres."). */
function mensagemValidacao(err: ZodError) {
  const [primeira] = err.issues;
  if (!primeira) return "Dados inválidos.";
  const rotulo = rotuloCampo(primeira.path);
  const msg = primeira.message;
  // Minúscula só quando a frase começa com palavra comum ("Use…"), não com sigla ("CPF…").
  const corpo = /^\p{Lu}\p{Ll}/u.test(msg) ? msg[0]!.toLowerCase() + msg.slice(1) : msg;
  // Sem prefixo quando a frase já nomeia o campo ("E-mail inválido.", "Identificador inválido.").
  const jaNomeia = rotulo && msg.toLowerCase().startsWith(rotulo.toLowerCase());
  const base = rotulo && !jaNomeia ? `${rotulo}: ${corpo}` : msg;
  const outros = new Set(err.issues.map((i) => i.path.join("."))).size - 1;
  if (outros <= 0) return base;
  return `${base.replace(/\.$/, "")} (e mais ${outros} ${outros === 1 ? "campo" : "campos"}).`;
}

// ───────────────────────── Prisma ─────────────────────────

/** Duplicidade por campo único (P2002). `target` vem como lista de campos ou nome do índice. */
function mensagemDuplicado(target: unknown) {
  const alvo = (Array.isArray(target) ? target.join(",") : String(target ?? "")).toLowerCase();
  if (alvo.includes("email")) return "Já existe um cadastro com esse e-mail.";
  if (alvo.includes("documento")) return "Já existe um prestador com esse CPF/CNPJ.";
  if (alvo.includes("cnpj")) return "Já existe um condomínio com esse CNPJ.";
  if (alvo.includes("slug") || alvo.includes("nome")) return "Já existe um cadastro com esse nome.";
  if (alvo.includes("clerk")) return "Esta conta já está ligada a outro cadastro.";
  return "Já existe um cadastro com esses dados.";
}

const CODIGOS_INDISPONIVEL = new Set([
  "P1001", // não alcança o banco
  "P1002", // tempo esgotado ao conectar
  "P1008", // operação expirou
  "P1017", // servidor fechou a conexão
  "P2024", // tempo esgotado esperando conexão do pool
  "P2028", // transação expirou/fechada
]);

/** Pooler (pgbouncer) e quedas de conexão chegam como erro "desconhecido" com texto do Postgres. */
const TEXTO_INDISPONIVEL =
  /prepared statement|can't reach database|connection (terminated|refused|reset|closed)|timed out|ECONNRESET|ECONNREFUSED|too many (connections|clients)/i;

function traduzirPrisma(err: unknown): AppError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (CODIGOS_INDISPONIVEL.has(err.code)) return new AppError(503, "INDISPONIVEL", INDISPONIVEL);
    switch (err.code) {
      case "P2002":
        return new AppError(409, "REGISTRO_DUPLICADO", mensagemDuplicado(err.meta?.target));
      case "P2025":
      case "P2001":
        return new AppError(
          404,
          "NAO_ENCONTRADO",
          "Não encontramos o registro. Ele pode ter sido removido.",
        );
      case "P2003":
      case "P2014":
        return new AppError(
          409,
          "REFERENCIA_INVALIDA",
          "Um dos itens relacionados não existe mais ou ainda está em uso. Atualize a página e tente de novo.",
        );
      case "P2000":
        return new AppError(400, "VALIDACAO", "Um dos campos passou do tamanho permitido.");
      case "P2023":
        return new AppError(400, "VALIDACAO", "Identificador inválido.");
      case "P2034":
        return new AppError(
          409,
          "ALTERACAO_SIMULTANEA",
          "Outra pessoa alterou estes dados ao mesmo tempo. Atualize a página e tente de novo.",
        );
      case "P2010":
        if (TEXTO_INDISPONIVEL.test(err.message))
          return new AppError(503, "INDISPONIVEL", INDISPONIVEL);
        return null;
      default:
        return null;
    }
  }
  if (err instanceof Prisma.PrismaClientInitializationError)
    return new AppError(503, "INDISPONIVEL", INDISPONIVEL);
  if (err instanceof Prisma.PrismaClientUnknownRequestError && TEXTO_INDISPONIVEL.test(err.message))
    return new AppError(503, "INDISPONIVEL", INDISPONIVEL);
  return null;
}

// ───────────────────────── Corpo da requisição (express.json) ─────────────────────────

interface ErroCorpo {
  type?: string;
  status?: number;
  limit?: number;
}

const kb = (bytes?: number) => (bytes ? `${Math.round(bytes / 1024)} KB` : "o permitido");

function traduzirCorpo(err: unknown): AppError | null {
  const e = err as ErroCorpo | null;
  if (!e || typeof e.type !== "string") return null;
  switch (e.type) {
    case "entity.parse.failed":
      return new AppError(
        400,
        "JSON_INVALIDO",
        "Os dados enviados não estão em JSON válido. Confira o formato e tente de novo.",
      );
    case "entity.too.large":
      return new AppError(
        413,
        "CORPO_GRANDE",
        `Os dados enviados passam do limite de ${kb(e.limit)}. Envie arquivos pelo campo de anexo.`,
      );
    case "encoding.unsupported":
    case "charset.unsupported":
      return new AppError(415, "CODIFICACAO_INVALIDA", "Envie os dados em UTF-8.");
    default:
      if (typeof e.status === "number" && e.status >= 400 && e.status < 500)
        return new AppError(
          e.status,
          "REQUISICAO_INVALIDA",
          "Não foi possível ler os dados enviados.",
        );
      return null;
  }
}

// ───────────────────────── Upload (multer) ─────────────────────────

/** Fallback; as rotas de upload já traduzem com o limite da rota (middlewares/upload.ts). */
export function traduzirMulter(err: MulterError, maxArquivos?: number, campo?: string): AppError {
  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      return new AppError(
        413,
        "ARQUIVO_GRANDE",
        "O arquivo passa do limite de 5 MB. Escolha um arquivo menor.",
      );
    case "LIMIT_FILE_COUNT":
      return new AppError(400, "ARQUIVOS_DEMAIS", limiteArquivos(maxArquivos));
    case "LIMIT_UNEXPECTED_FILE":
      // `.array(campo, max)` acusa excesso de arquivos com este código, no próprio campo.
      if (!campo || err.field === campo)
        return new AppError(400, "ARQUIVOS_DEMAIS", limiteArquivos(maxArquivos));
      return new AppError(
        400,
        "CAMPO_DE_ARQUIVO_INVALIDO",
        `Envie o arquivo no campo "${campo}" (recebido em "${err.field ?? "?"}").`,
      );
    case "LIMIT_FIELD_KEY":
    case "LIMIT_FIELD_VALUE":
      return new AppError(
        413,
        "CAMPO_GRANDE",
        "Um dos campos do formulário passa do tamanho permitido.",
      );
    case "LIMIT_FIELD_COUNT":
    case "LIMIT_PART_COUNT":
      return new AppError(400, "CAMPOS_DEMAIS", "O formulário enviado tem campos demais.");
    default:
      return new AppError(400, "UPLOAD_INVALIDO", "Não foi possível ler os arquivos enviados.");
  }
}

const limiteArquivos = (max?: number) =>
  max === undefined
    ? "Arquivos demais nesta requisição."
    : max === 1
      ? "Envie um arquivo por vez."
      : `Envie no máximo ${max} arquivos por vez.`;

// ───────────────────────── Clerk ─────────────────────────

/** Erros da API do Clerk (`ClerkAPIResponseError` tem `clerkError: true` e o status HTTP). */
function traduzirClerk(err: unknown): AppError | null {
  const e = err as { clerkError?: boolean; status?: number } | null;
  if (!e || e.clerkError !== true) return null;
  if (e.status === 401 || e.status === 403)
    return new AppError(401, "NAO_AUTENTICADO", "Sua sessão expirou. Entre novamente.");
  return new AppError(
    503,
    "INDISPONIVEL",
    "Não foi possível confirmar sua sessão agora. Tente novamente em instantes.",
  );
}

// ───────────────────────── Middleware ─────────────────────────

const contexto = (req: Request) => ({
  metodo: req.method,
  rota: req.originalUrl,
  usuarioId: req.ctx?.usuario.id,
  clerkUserId: req.clerkUserId,
  perfil: req.ctx?.perfil,
});

export const tratarErro: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const log = req.log ?? logger;

  if (err instanceof ZodError) {
    res.status(400).json({
      erro: {
        codigo: "VALIDACAO",
        mensagem: mensagemValidacao(err),
        campos: err.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
      },
    });
    return;
  }

  const traduzido =
    err instanceof AppError
      ? err
      : err instanceof MulterError
        ? traduzirMulter(err)
        : (traduzirPrisma(err) ?? traduzirClerk(err) ?? traduzirCorpo(err));

  if (traduzido) {
    // Falha de infraestrutura (banco, storage, Clerk): registra a causa real.
    if (traduzido.status >= 500)
      log.error({ err, ...contexto(req), codigo: traduzido.codigo }, "serviço indisponível");
    res
      .status(traduzido.status)
      .json({ erro: { codigo: traduzido.codigo, mensagem: traduzido.message } });
    return;
  }

  log.error({ err, ...contexto(req) }, "erro não tratado");
  res.status(500).json({
    erro: {
      codigo: "ERRO_INTERNO",
      mensagem: "Tivemos um problema inesperado. Tente novamente em instantes.",
    },
  });
};
