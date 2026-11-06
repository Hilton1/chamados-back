// Envio de arquivos ao storage com limpeza: se a gravação no banco falhar depois do upload,
// os arquivos enviados são removidos (evita órfãos no bucket).
import { randomUUID } from "node:crypto";
import type { Prisma, TipoAnexo } from "@prisma/client";
import { logger } from "../../lib/logger.js";
import { caminhoAnexo, storage, type PastaAnexo } from "../../lib/storage/index.js";
import type { ArquivoValidado } from "../../middlewares/upload.js";

const PASTA: Record<TipoAnexo, PastaAnexo> = {
  ABERTURA: "abertura",
  FORMULARIO: "formulario",
  PROPOSTA: "proposta",
  COMPROVACAO: "comprovacao",
  NOTA_FISCAL: "nota-fiscal",
  PAGAMENTO: "pagamento",
};

export interface ArquivoEnviado extends ArquivoValidado {
  path: string;
}

/** Sobe os arquivos; se algum falhar, remove os que já subiram e repassa o erro. */
export async function subirArquivos(
  ordemId: string,
  tipo: TipoAnexo,
  arquivos: ArquivoValidado[],
  subpasta?: string,
): Promise<ArquivoEnviado[]> {
  const enviados: ArquivoEnviado[] = [];
  try {
    for (const a of arquivos) {
      const nome = `${subpasta ? `${subpasta}/` : ""}${randomUUID()}.${a.extensao}`;
      const path = caminhoAnexo(ordemId, PASTA[tipo], nome);
      await storage().upload(path, a.conteudo, a.mime);
      enviados.push({ ...a, path });
    }
    return enviados;
  } catch (err) {
    await removerArquivos(enviados.map((e) => e.path));
    throw err;
  }
}

export async function removerArquivos(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await storage().remove(paths);
  } catch (err) {
    logger.error({ err, paths }, "não foi possível remover arquivos órfãos do storage");
  }
}

/** Executa a gravação; se ela falhar, apaga do storage os arquivos já enviados. */
export async function gravarComArquivos<T>(enviados: ArquivoEnviado[], gravar: () => Promise<T>) {
  try {
    return await gravar();
  } catch (err) {
    await removerArquivos(enviados.map((e) => e.path));
    throw err;
  }
}

/** Linhas de `anexos` para os arquivos enviados. */
export const dadosAnexos = (
  enviados: ArquivoEnviado[],
  base: { ordemId: string; tipo: TipoAnexo; enviadoPorId: string; propostaId?: string },
): Prisma.AnexoCreateManyInput[] =>
  enviados.map((e) => ({
    ordemId: base.ordemId,
    propostaId: base.propostaId ?? null,
    tipo: base.tipo,
    enviadoPorId: base.enviadoPorId,
    nomeOriginal: e.nome,
    storagePath: e.path,
    mimeType: e.mime,
    tamanhoBytes: e.tamanho,
  }));
