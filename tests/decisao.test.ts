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

// Palmeiras: aprovador = Carlos (síndico). Solar: sem aprovador (a administradora aprova).
let palmeiras: { id: string };
let solar: { id: string };
let tipo: { id: string };
let admId: string;
let carlosId: string;
let p1: { id: string };
let p2: { id: string };

const adm = () => como("user_adm");
const carlos = () => como("user_carlos");
const marta = () => como("user_marta"); // síndica do Solar, não aprova
const fiscal = () => como("user_fiscal");

async function ordemCom(
  condominioId: string,
  status: "ABERTO" | "AGUARDANDO_APROVACAO" = "ABERTO",
) {
  const o = await criarOrdem({ condominioId, criadoPorId: admId, categoriaIds: [tipo.id], status });
  const a = await criarProposta({
    ordemId: o.id,
    prestadorId: p1.id,
    valor: 300,
    status: status === "AGUARDANDO_APROVACAO" ? "TRANSFERIDA" : "ENVIADA",
  });
  const b = await criarProposta({ ordemId: o.id, prestadorId: p2.id, valor: 280 });
  return { o, a, b };
}

beforeEach(async () => {
  await limparBanco();
  limparStorage();
  tipo = await criarCategoria({ nome: "Elétrica" });
  palmeiras = await criarCondominio({ nome: "Palmeiras" });
  solar = await criarCondominio({ nome: "Solar" });
  admId = (await criarPessoa({ nome: "Yasmin", administradora: true, clerk: "user_adm" })).id;
  carlosId = (
    await criarPessoa({
      nome: "Carlos",
      clerk: "user_carlos",
      vinculos: [{ condominioId: palmeiras.id, perfil: "SINDICO" }],
    })
  ).id;
  await prisma.condominio.update({ where: { id: palmeiras.id }, data: { aprovadorId: carlosId } });
  await criarPessoa({
    nome: "Marta",
    clerk: "user_marta",
    vinculos: [{ condominioId: solar.id, perfil: "SINDICO" }],
  });
  await criarPessoa({
    clerk: "user_fiscal",
    vinculos: [{ condominioId: palmeiras.id, perfil: "FISCAL" }],
  });
  p1 = await criarPrestador({ razaoSocial: "Eletro Silva", categoriaIds: [tipo.id] });
  p2 = await criarPrestador({ razaoSocial: "Luz & Cia", categoriaIds: [tipo.id] });
});

describe("transferir", () => {
  it("administradora transfere: proposta TRANSFERIDA, ordem em aprovação, evento", async () => {
    const { o, a } = await ordemCom(palmeiras.id);
    const res = await adm().post(`/ordens/${o.id}/transferir`, { propostaId: a.id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("AGUARDANDO_APROVACAO");
    expect(res.body.propostas.find((p: { id: string }) => p.id === a.id).status).toBe(
      "TRANSFERIDA",
    );
    expect(res.body.eventos.at(-1)).toMatchObject({
      tipo: "TRANSFERIDA",
      texto: "Administradora transferiu para aprovação de Carlos a proposta de Eletro Silva",
    });
  });

  it("só a administradora; condomínio sem aprovador → aprova direto", async () => {
    const { o, a } = await ordemCom(palmeiras.id);
    expect((await carlos().post(`/ordens/${o.id}/transferir`, { propostaId: a.id })).status).toBe(
      403,
    );
    const s = await ordemCom(solar.id);
    const res = await adm().post(`/ordens/${s.o.id}/transferir`, { propostaId: s.a.id });
    expect(res.status).toBe(409);
    expect(res.body.erro.codigo).toBe("ADMINISTRADORA_APROVA");
  });

  it("proposta cancelada ou de outra ordem não pode ser transferida", async () => {
    const { o } = await ordemCom(palmeiras.id);
    const p3 = await criarPrestador({ categoriaIds: [tipo.id] });
    const cancelada = await criarProposta({
      ordemId: o.id,
      prestadorId: p3.id,
      status: "CANCELADA",
    });
    expect(
      (await adm().post(`/ordens/${o.id}/transferir`, { propostaId: cancelada.id })).body.erro
        .codigo,
    ).toBe("PROPOSTA_INVALIDA");
    const outra = await ordemCom(palmeiras.id);
    expect(
      (await adm().post(`/ordens/${o.id}/transferir`, { propostaId: outra.a.id })).status,
    ).toBe(404);
  });
});

describe("aprovar", () => {
  it("aprovador aprova a transferida: ACEITA, demais RECUSADA, EM_EXECUCAO, marco", async () => {
    const { o, a, b } = await ordemCom(palmeiras.id, "AGUARDANDO_APROVACAO");
    const res = await carlos().post(`/ordens/${o.id}/aprovar`, { propostaId: a.id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("EM_EXECUCAO");
    expect(res.body.valorContratado).toBe(300);
    const st = Object.fromEntries(
      res.body.propostas.map((p: { id: string; status: string }) => [p.id, p.status]),
    );
    expect(st).toEqual({ [a.id]: "ACEITA", [b.id]: "RECUSADA" });
    expect(res.body.eventos.at(-1)).toMatchObject({
      tipo: "APROVADA",
      texto: "Carlos aprovou a proposta de Eletro Silva",
      marco: true,
    });
    const gravada = await prisma.ordem.findUnique({ where: { id: o.id } });
    expect(gravada?.aprovadoPorId).toBe(carlosId);
  });

  it("quem não é o aprovador não aprova (nem a administradora, se há aprovador)", async () => {
    const { o, a } = await ordemCom(palmeiras.id, "AGUARDANDO_APROVACAO");
    for (const r of [adm(), fiscal()]) {
      const res = await r.post(`/ordens/${o.id}/aprovar`, { propostaId: a.id });
      expect(res.status).toBe(403);
      expect(res.body.erro.codigo).toBe("NAO_E_APROVADOR");
    }
  });

  it("sem aprovador: administradora aprova direto de ABERTO; síndica não", async () => {
    const { o, b } = await ordemCom(solar.id);
    expect(
      (await marta().post(`/ordens/${o.id}/aprovar`, { propostaId: b.id })).body.erro.codigo,
    ).toBe("NAO_E_APROVADOR");
    const res = await adm().post(`/ordens/${o.id}/aprovar`, { propostaId: b.id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("EM_EXECUCAO");
  });

  it("com aprovador, não aprova direto de ABERTO; aprovada de novo → 409", async () => {
    const { o, a } = await ordemCom(palmeiras.id);
    expect(
      (await carlos().post(`/ordens/${o.id}/aprovar`, { propostaId: a.id })).body.erro.codigo,
    ).toBe("PROPOSTA_INVALIDA");
    const t = await ordemCom(palmeiras.id, "AGUARDANDO_APROVACAO");
    await carlos().post(`/ordens/${t.o.id}/aprovar`, { propostaId: t.a.id });
    expect((await carlos().post(`/ordens/${t.o.id}/aprovar`, { propostaId: t.a.id })).status).toBe(
      409,
    );
  });
});

describe("reprovar", () => {
  it("volta para ABERTO, proposta RECUSADA com motivo, demais seguem em disputa", async () => {
    const { o, a, b } = await ordemCom(palmeiras.id, "AGUARDANDO_APROVACAO");
    const res = await carlos().post(`/ordens/${o.id}/reprovar`, {
      propostaId: a.id,
      motivo: "Caro demais",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ABERTO");
    const pa = res.body.propostas.find((p: { id: string }) => p.id === a.id);
    const pb = res.body.propostas.find((p: { id: string }) => p.id === b.id);
    expect(pa).toMatchObject({ status: "RECUSADA", motivoRecusa: "Caro demais" });
    expect(pb.status).toBe("ENVIADA");
    expect(res.body.eventos.at(-1)).toMatchObject({
      tipo: "REPROVADA",
      texto: "Carlos reprovou a proposta de Eletro Silva: “Caro demais”",
      marco: true,
    });
    // A administradora pode transferir outra.
    const outra = await adm().post(`/ordens/${o.id}/transferir`, { propostaId: b.id });
    expect(outra.body.status).toBe("AGUARDANDO_APROVACAO");
  });

  it("só a transferida", async () => {
    const { o, b } = await ordemCom(palmeiras.id, "AGUARDANDO_APROVACAO");
    expect(
      (await carlos().post(`/ordens/${o.id}/reprovar`, { propostaId: b.id })).body.erro.codigo,
    ).toBe("PROPOSTA_NAO_TRANSFERIDA");
  });
});

describe("comparação e WhatsApp", () => {
  it("GET /ordens/:id/propostas traz o prestador com média e nº de serviços", async () => {
    const { o } = await ordemCom(palmeiras.id);
    const res = await carlos().get(`/ordens/${o.id}/propostas`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].prestador).toEqual({
      id: p1.id,
      razaoSocial: "Eletro Silva",
      mediaAvaliacao: 0,
      totalAvaliacoes: 0,
      totalServicos: 0,
      emiteNotaFiscal: true,
    });
    expect((await fiscal().get(`/ordens/${o.id}/propostas`)).status).toBe(403);
  });

  it("link wa.me do prestador aprovado com mensagem pronta", async () => {
    const { o, a } = await ordemCom(palmeiras.id, "AGUARDANDO_APROVACAO");
    expect((await carlos().get(`/ordens/${o.id}/whatsapp`)).status).toBe(409);
    await carlos().post(`/ordens/${o.id}/aprovar`, { propostaId: a.id });
    const res = await carlos().get(`/ordens/${o.id}/whatsapp`);
    expect(res.body.url).toMatch(/^https:\/\/wa\.me\/5582999990001\?text=/);
    expect(decodeURIComponent(res.body.url.split("text=")[1])).toContain(`#${o.numero}`);
  });
});
