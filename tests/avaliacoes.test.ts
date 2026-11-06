import { beforeEach, describe, expect, it } from "vitest";
import {
  criarCategoria,
  criarCondominio,
  criarOrdem,
  criarPessoa,
  criarPrestador,
  criarProposta,
  limparBanco,
  prisma,
} from "./helpers/db.js";
import { como } from "./helpers/http.js";
import { limparStorage } from "./helpers/storage.js";

const HORA = 3_600_000;
let condId: string;
let eletrica: { id: string };
let piscina: { id: string };
let sindicoId: string;
let prestadorId: string;

const sindico = () => como("user_sind");

/** Ordem concluída com a proposta do prestador aceita. `atraso` em horas além do prazo combinado. */
async function concluida(o: { categoriaIds?: string[]; atraso?: number } = {}) {
  const ordem = await criarOrdem({
    condominioId: condId,
    criadoPorId: sindicoId,
    categoriaIds: o.categoriaIds ?? [eletrica.id],
    status: "CONCLUIDO",
  });
  const disponivelEm = new Date(Date.now() - 48 * HORA);
  await criarProposta({
    ordemId: ordem.id,
    prestadorId,
    status: "ACEITA",
    disponivelEm,
    tempoExecucaoHoras: 4,
  });
  await prisma.ordem.update({
    where: { id: ordem.id },
    data: { concluidoEm: new Date(disponivelEm.getTime() + (4 + (o.atraso ?? -1)) * HORA) },
  });
  return ordem;
}

beforeEach(async () => {
  await limparBanco();
  limparStorage();
  condId = (await criarCondominio()).id;
  eletrica = await criarCategoria({ nome: "Elétrica" });
  piscina = await criarCategoria({ nome: "Piscina" });
  sindicoId = (
    await criarPessoa({
      nome: "Carlos",
      clerk: "user_sind",
      vinculos: [{ condominioId: condId, perfil: "SINDICO" }],
    })
  ).id;
  await criarPessoa({ clerk: "user_fisc", vinculos: [{ condominioId: condId, perfil: "FISCAL" }] });
  prestadorId = (await criarPrestador({ razaoSocial: "Eletro Silva", categoriaIds: [eletrica.id] }))
    .id;
});

describe("avaliar", () => {
  it("grava a nota, atualiza a média do prestador e registra o evento", async () => {
    const a = await concluida();
    const b = await concluida();
    const r1 = await sindico().post(`/ordens/${a.id}/avaliacao`, { nota: 5, comentario: "Ótimo" });
    expect(r1.status).toBe(200);
    expect(r1.body.avaliacao).toEqual({ nota: 5, comentario: "Ótimo" });
    expect(r1.body.eventos.at(-1)).toMatchObject({
      tipo: "AVALIADO",
      texto: "Prestador avaliado com nota 5",
    });
    await sindico().post(`/ordens/${b.id}/avaliacao`, { nota: 4 });
    const p = await prisma.prestador.findUnique({ where: { id: prestadorId } });
    expect(Number(p?.mediaAvaliacao)).toBe(4.5);
    expect(p?.totalAvaliacoes).toBe(2);
  });

  it("uma por ordem; só concluída; nota de 1 a 5; fiscal não avalia", async () => {
    const a = await concluida();
    expect((await como("user_fisc").post(`/ordens/${a.id}/avaliacao`, { nota: 5 })).status).toBe(
      403,
    );
    expect((await sindico().post(`/ordens/${a.id}/avaliacao`, { nota: 6 })).status).toBe(400);
    await sindico().post(`/ordens/${a.id}/avaliacao`, { nota: 3 });
    expect((await sindico().post(`/ordens/${a.id}/avaliacao`, { nota: 4 })).body.erro.codigo).toBe(
      "JA_AVALIADA",
    );
    const aberta = await criarOrdem({
      condominioId: condId,
      criadoPorId: sindicoId,
      categoriaIds: [eletrica.id],
    });
    expect(
      (await sindico().post(`/ordens/${aberta.id}/avaliacao`, { nota: 4 })).body.erro.codigo,
    ).toBe("TRANSICAO_INVALIDA");
  });
});

describe("histórico do prestador", () => {
  it("serviços por tipo, prazo cumprido e último serviço", async () => {
    await concluida(); // no prazo
    await concluida({ categoriaIds: [eletrica.id, piscina.id], atraso: 3 }); // atrasada
    await sindico().post(`/ordens/${(await concluida()).id}/avaliacao`, { nota: 4 });
    const res = await sindico().get(`/prestadores/${prestadorId}/historico`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      media: 4,
      totalServicos: 3,
      porCategoria: [
        { categoria: "Elétrica", total: 3 },
        { categoria: "Piscina", total: 1 },
      ],
      prazoCumprido: { cumpridos: 2, total: 3 },
      ultimoServicoEm: expect.any(String),
    });
  });

  it("sem serviços: zeros; prestador inexistente → 404", async () => {
    const res = await como("user_fisc").get(`/prestadores/${prestadorId}/historico`);
    expect(res.body).toEqual({
      media: 0,
      totalServicos: 0,
      porCategoria: [],
      prazoCumprido: { cumpridos: 0, total: 0 },
    });
    expect((await sindico().get(`/prestadores/${condId}/historico`)).status).toBe(404);
  });
});
