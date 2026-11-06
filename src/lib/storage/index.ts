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

/** Pasta de cada tipo de anexo dentro da ordem de serviço. */
export type PastaAnexo =
  "abertura" | "formulario" | "proposta" | "comprovacao" | "nota-fiscal" | "pagamento";

/** Caminhos no bucket: `ordens/{id}/{pasta}/…` (arquivos da proposta: `ordens/{id}/proposta/{propostaId}/…`). */
export const caminhoAnexo = (ordemId: string, pasta: PastaAnexo, arquivo: string) =>
  `ordens/${ordemId}/${pasta}/${arquivo}`;
