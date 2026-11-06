import type { Usuario, VinculoCondominio } from "@prisma/client";

export const INCLUDE_PESSOA = { vinculos: true } as const;

/** Formato `Pessoa` do front. */
export const serializarPessoa = (u: Usuario & { vinculos: VinculoCondominio[] }) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  telefone: u.telefone ?? undefined,
  administradora: u.administradora,
  vinculos: u.vinculos.map((v) => ({ condominioId: v.condominioId, perfil: v.perfil })),
  ativo: u.ativo,
  contaCriada: u.clerkUserId !== null,
});
