import { z } from "zod";
import { documento, email, telefone, texto, uuid } from "../../lib/validacao.js";

const comum = {
  razaoSocial: texto(2, 150),
  nomeContato: texto(2, 120),
  telefoneWhatsapp: telefone,
  emiteNotaFiscal: z.boolean({ error: "Informe se emite nota fiscal." }),
  areaAtuacao: texto(2, 200),
  categoriaIds: z.array(uuid).min(1, "Escolha ao menos um tipo de serviço."),
};

/** Cadastro/edição pela administradora. */
export const prestadorInput = z.object({ ...comum, documento, email });
export type PrestadorInput = z.infer<typeof prestadorInput>;

/** Edição pela administradora: o documento antigo pode ser de antes da validação de dígitos. */
export const prestadorEdicaoInput = prestadorInput.extend({ documento: z.string() });

/** Autocadastro: o e-mail vem da conta do Clerk. */
export const cadastroInput = z.object({ ...comum, documento });
export type CadastroInput = z.infer<typeof cadastroInput>;

/** "Meu cadastro": documento e e-mail só a administradora muda. */
export const meuCadastroInput = z.object(comum);
export type MeuCadastroInput = z.infer<typeof meuCadastroInput>;

export const filtroQuery = z.object({
  busca: z.string().trim().optional(),
  categoriaId: uuid.optional(),
  situacao: z.enum(["PENDENTE", "ATIVO", "INATIVO"]).optional(),
});
export type Filtro = z.infer<typeof filtroQuery>;

export const desativarInput = z
  .object({ motivo: z.string().trim().max(500).optional() })
  .default({});
