// Contrato do armazenamento de anexos. Os services só conhecem esta interface; trocar Supabase
// por S3/R2 é mudar STORAGE_DRIVER e as credenciais, sem tocar em regra de negócio.
// O banco guarda apenas o caminho (`anexos.storage_path`), nunca a URL.
export interface Storage {
  /** Grava (ou sobrescreve) o arquivo no caminho informado, dentro do bucket configurado. */
  upload(path: string, body: Buffer, contentType: string): Promise<void>;
  /** Remove os arquivos; caminhos inexistentes são ignorados. */
  remove(paths: string[]): Promise<void>;
  /** URL temporária de leitura (bucket é privado). */
  signedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}
