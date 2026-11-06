import { env } from "../../config/env.js";
import { criarStorageS3 } from "./s3.js";
import { criarStorageSupabase } from "./supabase.js";
import type { Storage } from "./types.js";

export type { Storage } from "./types.js";

let instancia: Storage | undefined;

/** Driver escolhido por STORAGE_DRIVER. Criado na 1ª chamada (testes não precisam de credenciais). */
export function storage(): Storage {
  instancia ??= env.STORAGE_DRIVER === "supabase" ? criarStorageSupabase() : criarStorageS3();
  return instancia;
}

/** Caminhos no bucket: `chamados/{id}/abertura/…` e `chamados/{id}/comprovacao/…`. */
export const caminhoAnexo = (
  chamadoId: string,
  tipo: "abertura" | "comprovacao",
  arquivo: string,
) => `chamados/${chamadoId}/${tipo}/${arquivo}`;
