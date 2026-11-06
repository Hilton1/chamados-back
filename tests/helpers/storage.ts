// Storage em memória para os testes. `falharUpload` simula o provedor fora do ar.
import type { Storage } from "../../src/lib/storage/types.js";

export const arquivos = new Map<string, { contentType: string; tamanho: number }>();
export const controle = { falharUpload: false };

export const storageFalso: Storage = {
  async upload(path, body, contentType) {
    if (controle.falharUpload) throw new Error("storage fora do ar");
    arquivos.set(path, { contentType, tamanho: body.length });
  },
  async remove(paths) {
    for (const p of paths) arquivos.delete(p);
  },
  async signedUrl(path) {
    return `https://storage.test/${path}`;
  },
};

export function limparStorage() {
  arquivos.clear();
  controle.falharUpload = false;
}
