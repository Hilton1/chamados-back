// Variáveis de ambiente validadas uma única vez na subida. O resto do código importa `env` daqui,
// nunca lê `process.env` direto.
import { z } from "zod";

const vazioComoUndefined = (v: unknown) => (v === "" ? undefined : v);
const opcional = z.preprocess(vazioComoUndefined, z.string().optional());

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3333),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    // Uma ou mais origens separadas por vírgula (ex.: produção + preview da Vercel).
    FRONTEND_URL: z
      .string()
      .default("http://localhost:3000")
      .transform((s) =>
        s
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      ),

    DATABASE_URL: z.string().min(1),
    DIRECT_URL: opcional,

    // Clerk. Opcionais em desenvolvimento para a API subir antes das chaves existirem;
    // obrigatórias em produção (ver refine abaixo).
    CLERK_PUBLISHABLE_KEY: opcional,
    CLERK_SECRET_KEY: opcional,

    // Storage de anexos: "supabase" (padrão) ou "s3" (AWS S3, Cloudflare R2…). Ver docs/storage.md.
    STORAGE_DRIVER: z.enum(["supabase", "s3"]).default("supabase"),
    STORAGE_BUCKET: z.string().default("anexos"),
    STORAGE_SIGNED_URL_TTL: z.coerce.number().int().positive().default(600), // segundos

    SUPABASE_URL: opcional,
    SUPABASE_SERVICE_ROLE_KEY: opcional,

    S3_ENDPOINT: opcional, // vazio = AWS S3. R2 e afins: URL do serviço
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY_ID: opcional,
    S3_SECRET_ACCESS_KEY: opcional,
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    SEED_ADMIN_EMAIL: opcional,
    SEED_ADMIN_NOME: z.string().default("Administradora"),
  })
  .superRefine((e, ctx) => {
    const exigir = (campo: keyof typeof e, motivo: string) => {
      if (!e[campo])
        ctx.addIssue({ code: "custom", path: [campo], message: `obrigatória ${motivo}` });
    };
    // Em dev/teste a API sobe sem credenciais externas; o que faltar só falha quando for usado.
    if (e.NODE_ENV !== "production") return;
    exigir("CLERK_SECRET_KEY", "em produção");
    exigir("CLERK_PUBLISHABLE_KEY", "em produção");
    if (e.STORAGE_DRIVER === "supabase") {
      exigir("SUPABASE_URL", "com STORAGE_DRIVER=supabase");
      exigir("SUPABASE_SERVICE_ROLE_KEY", "com STORAGE_DRIVER=supabase");
    } else {
      exigir("S3_ACCESS_KEY_ID", "com STORAGE_DRIVER=s3");
      exigir("S3_SECRET_ACCESS_KEY", "com STORAGE_DRIVER=s3");
    }
  });

function carregar() {
  const r = schema.safeParse(process.env);
  if (!r.success) {
    const erros = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${erros}`);
  }
  return r.data;
}

export const env = carregar();
export type Env = typeof env;
