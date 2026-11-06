import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";
import type { Storage } from "./types.js";

// Supabase Storage via SDK oficial. A service role key ignora RLS: só pode existir no servidor.
export function criarStorageSupabase(): Storage {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error(
      "Storage Supabase sem credenciais: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = () => supabase.storage.from(env.STORAGE_BUCKET);

  return {
    async upload(path, body, contentType) {
      const { error } = await bucket().upload(path, body, { contentType, upsert: true });
      if (error) throw error;
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw error;
    },
    async signedUrl(path, expiresInSeconds = env.STORAGE_SIGNED_URL_TTL) {
      const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
