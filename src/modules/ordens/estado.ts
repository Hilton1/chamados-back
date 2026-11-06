// Máquina de estados da ordem de serviço. Toda mudança de status passa por aqui, dentro de uma
// transação, junto com o evento da linha do tempo. Nenhum outro código altera `status` direto.
import type { Prisma, StatusOrdem, TipoEvento } from "@prisma/client";
import { AppError } from "../../middlewares/erro.js";

type Tx = Prisma.TransactionClient;

/** Transições válidas (origem → destinos). */
export const TRANSICOES: Record<StatusOrdem, StatusOrdem[]> = {
  ABERTO: ["AGUARDANDO_APROVACAO", "EM_EXECUCAO", "CANCELADO"], // EM_EXECUCAO: aprovação direta da administradora
  AGUARDANDO_APROVACAO: ["EM_EXECUCAO", "ABERTO", "CANCELADO"], // ABERTO: reprovada
  EM_EXECUCAO: ["CONCLUIDO", "CANCELADO"],
  CONCLUIDO: [],
  CANCELADO: [],
};

export interface NovoEvento {
  tipo: TipoEvento;
  texto: string;
  autorId: string | null;
  marco?: boolean;
}

export const registrarEvento = (tx: Tx, ordemId: string, e: NovoEvento) =>
  tx.ordemEvento.create({
    data: { ordemId, tipo: e.tipo, texto: e.texto, autorId: e.autorId, marco: e.marco ?? false },
  });

/**
 * Muda o status de `de` para `para`, grava os campos extras e o evento. A atualização é condicional
 * (`WHERE status = de`): se outra requisição mudou a ordem antes, responde 409 em vez de sobrescrever.
 */
export async function transicionar(
  tx: Tx,
  ordemId: string,
  de: StatusOrdem,
  para: StatusOrdem,
  evento: NovoEvento,
  dados: Omit<Prisma.OrdemUncheckedUpdateManyInput, "status"> = {},
) {
  if (!TRANSICOES[de].includes(para))
    throw new AppError(
      409,
      "TRANSICAO_INVALIDA",
      "Esta ação não vale para a situação atual da ordem de serviço.",
    );
  const { count } = await tx.ordem.updateMany({
    where: { id: ordemId, status: de },
    data: { ...dados, status: para },
  });
  if (count === 0)
    throw new AppError(
      409,
      "ORDEM_ALTERADA",
      "A ordem de serviço mudou de situação. Atualize a página.",
    );
  await registrarEvento(tx, ordemId, evento);
}
