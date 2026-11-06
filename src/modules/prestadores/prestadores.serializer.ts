import type { Prestador, PrestadorCategoria, Usuario } from "@prisma/client";

export const INCLUDE_PRESTADOR = {
  usuario: true,
  categorias: { select: { categoriaId: true } },
} as const;

type PrestadorCompleto = Prestador & {
  usuario: Usuario;
  categorias: Pick<PrestadorCategoria, "categoriaId">[];
};

/** Formato `Prestador` do front. E-mail e nome do contato vêm da conta (`usuarios`). */
export const serializarPrestador = (p: PrestadorCompleto, totalServicos: number) => ({
  id: p.id,
  razaoSocial: p.razaoSocial,
  documento: p.documento,
  nomeContato: p.usuario.nome,
  email: p.usuario.email,
  telefoneWhatsapp: p.telefoneWhatsapp,
  emiteNotaFiscal: p.emiteNotaFiscal,
  areaAtuacao: p.areaAtuacao,
  categoriaIds: p.categorias.map((c) => c.categoriaId),
  status: p.status,
  ativo: p.ativo,
  motivoInativacao: p.motivoInativacao ?? undefined,
  origem: p.origem,
  contaCriada: p.usuario.clerkUserId !== null,
  mediaAvaliacao: Number(p.mediaAvaliacao),
  totalAvaliacoes: p.totalAvaliacoes,
  totalServicos,
  createdAt: p.createdAt.toISOString(),
});
