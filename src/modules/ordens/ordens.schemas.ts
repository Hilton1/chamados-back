import { z } from "zod";
import { texto, uuid } from "../../lib/validacao.js";

export const novaOrdemInput = z
  .object({
    condominioId: uuid,
    categoriaIds: z.array(uuid).min(1, "Escolha pelo menos um tipo de serviço.").max(10),
    exigeNotaFiscal: z.boolean().default(false),
    titulo: texto(3, 120),
    descricao: texto(3, 4000),
    local: texto(1, 200),
    urgencia: z.enum(["NORMAL", "URGENTE"]),
    // A tela oferece 1/2/4/8 h; padrão 2 h.
    prazoUrgenteHoras: z.number().int().min(1).max(72).optional(),
  })
  .transform((v) => ({ ...v, categoriaIds: [...new Set(v.categoriaIds)] }));
export type NovaOrdemInput = z.infer<typeof novaOrdemInput>;

export const filtroOrdens = z.object({
  status: z
    .enum(["ABERTO", "AGUARDANDO_APROVACAO", "EM_EXECUCAO", "CONCLUIDO", "CANCELADO"])
    .optional(),
  urgencia: z.enum(["NORMAL", "URGENTE"]).optional(),
  categoriaId: uuid.optional(),
  busca: z.string().trim().max(100).optional(),
});
export type FiltroOrdens = z.infer<typeof filtroOrdens>;

export const propostaIdInput = z.object({ propostaId: uuid });
export const reprovarInput = z.object({
  propostaId: uuid,
  motivo: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || undefined),
});
export const avaliacaoInput = z.object({
  nota: z.number().int().min(1).max(5),
  comentario: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || undefined),
});
