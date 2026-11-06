import { z } from "zod";

/** Campos chegam como texto (multipart/form-data). */
export const propostaInput = z.object({
  valor: z.coerce
    .number({ error: "Informe o valor." })
    .positive("O valor precisa ser maior que zero.")
    .max(9_999_999_999)
    .transform((v) => Math.round(v * 100) / 100),
  disponivelEm: z.coerce.date({ error: "Informe quando você consegue começar." }),
  tempoExecucaoHoras: z.coerce
    .number({ error: "Informe o tempo de execução." })
    .int("Use horas inteiras.")
    .positive("O tempo de execução precisa ser maior que zero.")
    .max(10_000),
  observacao: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || undefined),
});
export type PropostaInput = z.infer<typeof propostaInput>;
