import { z } from "zod";
import { email, telefone, texto, uuid } from "../../lib/validacao.js";

export const pessoaInput = z.object({
  nome: texto(2, 120),
  email,
  telefone: z.preprocess((v) => (v === "" || v === null ? undefined : v), telefone.optional()),
  administradora: z.boolean(),
  vinculos: z
    .array(z.object({ condominioId: uuid, perfil: z.enum(["SINDICO", "FISCAL", "ZELADOR"]) }))
    .refine(
      (vs) => new Set(vs.map((v) => v.condominioId)).size === vs.length,
      "Um perfil por condomínio.",
    ),
  ativo: z.boolean(),
});
export type PessoaInput = z.infer<typeof pessoaInput>;
