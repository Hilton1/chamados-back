import { z } from "zod";
import { cnpj, texto, uuid } from "../../lib/validacao.js";

export const condominioInput = z.object({
  nome: texto(2, 120),
  cnpj: z.preprocess((v) => (v === "" || v === null ? undefined : v), cnpj.optional()),
  endereco: texto(3, 200),
  bairro: texto(2, 80),
  cidade: texto(2, 80),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "UF com 2 letras."),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  ativo: z.boolean(),
  aprovadorId: uuid.nullable(),
});
export type CondominioInput = z.infer<typeof condominioInput>;
