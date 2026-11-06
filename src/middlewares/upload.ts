// Upload em memória (multer) + checagem do tipo pelo CONTEÚDO (magic bytes), não pela extensão.
// Os tipos aceitos por TipoAnexo são os mesmos do CHECK `anexos_mime_por_tipo_chk` da migration.
import type { TipoAnexo } from "@prisma/client";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import { AppError } from "./erro.js";

export const TAMANHO_MAXIMO = 5 * 1024 * 1024;

const JPG = "image/jpeg";
const PNG = "image/png";
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const TIPOS_ACEITOS: Record<TipoAnexo, readonly string[]> = {
  ABERTURA: [JPG, PNG],
  FORMULARIO: [PDF, DOCX, XLSX],
  PROPOSTA: [JPG, PNG, PDF, DOCX, XLSX],
  COMPROVACAO: [JPG, PNG, PDF],
  NOTA_FISCAL: [JPG, PNG, PDF],
  PAGAMENTO: [JPG, PNG, PDF],
};

const EXTENSAO: Record<string, string> = {
  [JPG]: "jpg",
  [PNG]: "png",
  [PDF]: "pdf",
  [DOCX]: "docx",
  [XLSX]: "xlsx",
};

const DESCRICAO: Record<TipoAnexo, string> = {
  ABERTURA: "JPG ou PNG",
  FORMULARIO: "PDF, DOCX ou XLSX",
  PROPOSTA: "JPG, PNG, PDF, DOCX ou XLSX",
  COMPROVACAO: "JPG, PNG ou PDF",
  NOTA_FISCAL: "JPG, PNG ou PDF",
  PAGAMENTO: "JPG, PNG ou PDF",
};

const multerMemoria = (maxArquivos: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TAMANHO_MAXIMO, files: maxArquivos, fields: 20 },
  });

/** Um arquivo no campo `arquivo` (o front manda um por requisição). */
export const umArquivo = multerMemoria(1).single("arquivo");
/** Vários arquivos num campo (ex.: `arquivos` da proposta, `comprovantes` da conclusão). */
export const variosArquivos = (campo: string, max: number) => multerMemoria(max).array(campo, max);

export interface ArquivoValidado {
  nome: string;
  mime: string;
  extensao: string;
  tamanho: number;
  conteudo: Buffer;
}

/** O multer entrega o nome original em latin1; o navegador manda UTF-8. */
const nomeUtf8 = (nome: string) => Buffer.from(nome, "latin1").toString("utf8");

/** Confere o conteúdo de cada arquivo contra os tipos aceitos para o anexo. */
export async function validarArquivos(
  arquivos: Express.Multer.File[],
  tipo: TipoAnexo,
): Promise<ArquivoValidado[]> {
  const out: ArquivoValidado[] = [];
  for (const f of arquivos) {
    const detectado = await fileTypeFromBuffer(f.buffer);
    const mime = detectado?.mime;
    if (!mime || !TIPOS_ACEITOS[tipo].includes(mime))
      throw new AppError(
        415,
        "TIPO_DE_ARQUIVO_INVALIDO",
        `"${nomeUtf8(f.originalname)}" não é um arquivo aceito. Use ${DESCRICAO[tipo]}.`,
      );
    out.push({
      nome: nomeUtf8(f.originalname).slice(0, 200),
      mime,
      extensao: EXTENSAO[mime]!,
      tamanho: f.size,
      conteudo: f.buffer,
    });
  }
  return out;
}

/** Arquivos recebidos pelo multer (campo único ou vários). */
export function arquivosDa(req: { file?: Express.Multer.File; files?: unknown }) {
  if (req.file) return [req.file];
  return Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
}
