import type { Condominio } from "@prisma/client";

type ComAprovador = Condominio & { aprovador: { id: string; nome: string } | null };

export const INCLUDE_CONDOMINIO = { aprovador: { select: { id: true, nome: true } } } as const;

/** Formato `Condominio` do front. Campos opcionais vazios saem do JSON. */
export const serializarCondominio = (c: ComAprovador) => ({
  id: c.id,
  nome: c.nome,
  cnpj: c.cnpj ?? undefined,
  endereco: c.endereco,
  bairro: c.bairro,
  cidade: c.cidade,
  uf: c.uf,
  latitude: c.latitude === null ? undefined : Number(c.latitude),
  longitude: c.longitude === null ? undefined : Number(c.longitude),
  ativo: c.ativo,
  aprovador: c.aprovador ? { id: c.aprovador.id, nome: c.aprovador.nome } : null,
});
