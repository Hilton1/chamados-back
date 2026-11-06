import type { Categoria } from "@prisma/client";

/** Formato `Categoria` do front (tipo de serviço). */
export const serializarCategoria = (c: Categoria) => ({
  id: c.id,
  slug: c.slug,
  nome: c.nome,
  interna: c.interna,
  zeladorPodeAbrir: c.zeladorPodeAbrir,
  ativa: c.ativa,
});
