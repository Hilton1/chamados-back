import { z } from "zod";
import { texto } from "../../lib/validacao.js";

export const categoriaInput = z.object({
  nome: texto(2, 60),
  interna: z.boolean(),
  zeladorPodeAbrir: z.boolean(),
  ativa: z.boolean(),
});
export type CategoriaInput = z.infer<typeof categoriaInput>;

export const listarQuery = z.object({ todas: z.enum(["1", "true"]).optional() });
