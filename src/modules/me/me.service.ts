import { prisma } from "../../lib/prisma.js";
import type { Conta } from "../../middlewares/auth.js";
import { INCLUDE_CONDOMINIO, serializarCondominio } from "../condominios/condominios.serializer.js";

/** Formato `MeApi` do front. O perfil ativo é resolvido no front (e confirmado pela API via X-Perfil). */
export async function me(conta: Conta) {
  const condominiosAdministrados = conta.administradora
    ? (
        await prisma.condominio.findMany({
          where: { ativo: true },
          include: INCLUDE_CONDOMINIO,
          orderBy: { nome: "asc" },
        })
      ).map(serializarCondominio)
    : undefined;

  return {
    id: conta.id,
    nome: conta.nome,
    email: conta.email,
    administradora: conta.administradora,
    vinculos: conta.vinculos
      .slice()
      .sort((a, b) => a.condominio.nome.localeCompare(b.condominio.nome, "pt-BR"))
      .map((v) => ({ condominio: serializarCondominio(v.condominio), perfil: v.perfil })),
    condominiosAdministrados,
    prestador: conta.prestador
      ? {
          id: conta.prestador.id,
          status: conta.prestador.status,
          ativo: conta.prestador.ativo,
          categoriaIds: conta.prestador.categorias.map((c) => c.categoriaId),
        }
      : undefined,
  };
}
