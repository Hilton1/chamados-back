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

// Cenário: dois condomínios (A e B), uma pessoa de cada perfil e um prestador de elétrica.
let A: { id: string };
let B: { id: string };
let eletrica: { id: string };
let limpeza: { id: string };
let ti: { id: string };
let admId: string;
let sindicoAId: string;
let zeladorId: string;
let prestadorId: string;

const adm = () => como("user_adm");
const sindicoA = () => como("user_sind_a");
const fiscalA = () => como("user_fisc_a");
const zelador = () => como("user_zel_a");
const sindicoB = () => como("user_sind_b");
const prest = () => como("user_prest");

const corpo = (extra: object = {}) => ({
  condominioId: A.id,
  categoriaIds: [eletrica.id],
  exigeNotaFiscal: false,
  titulo: "Lâmpada queimada no hall",
  descricao: "A lâmpada do hall do bloco B queimou.",
  local: "Hall do bloco B",
  urgencia: "NORMAL",
  ...extra,
});

beforeEach(async () => {
  await limparBanco();
  limparStorage();
  A = await criarCondominio({ nome: "Palmeiras" });
  B = await criarCondominio({ nome: "Solar" });
  eletrica = await criarCategoria({ nome: "Elétrica" });
  limpeza = await criarCategoria({ nome: "Limpeza", zeladorPodeAbrir: true });
  ti = await criarCategoria({ nome: "TI", interna: true });
  admId = (await criarPessoa({ nome: "Yasmin", administradora: true, clerk: "user_adm" })).id;
  sindicoAId = (
    await criarPessoa({
      nome: "Carlos",
      clerk: "user_sind_a",
      vinculos: [{ condominioId: A.id, perfil: "SINDICO" }],
    })
  ).id;
  await criarPessoa({
    nome: "Marta",
    clerk: "user_fisc_a",
    vinculos: [{ condominioId: A.id, perfil: "FISCAL" }],
  });
  zeladorId = (
    await criarPessoa({
      nome: "Antônio",
      clerk: "user_zel_a",
      vinculos: [{ condominioId: A.id, perfil: "ZELADOR" }],
    })
  ).id;
  await criarPessoa({
    nome: "Beto",
    clerk: "user_sind_b",
    vinculos: [{ condominioId: B.id, perfil: "SINDICO" }],
  });
  prestadorId = (
    await criarPrestador({
      clerk: "user_prest",
      razaoSocial: "Eletro Silva",
      categoriaIds: [eletrica.id],
    })
  ).id;
});

describe("abrir ordem de serviço", () => {
  it("síndico abre no seu condomínio: formato do front, prazo de 48 h e evento de abertura", async () => {
    const res = await sindicoA().post("/ordens", corpo({ exigeNotaFiscal: true }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      numero: expect.any(Number),
      condominio: { id: A.id, nome: "Palmeiras", aprovador: null },
      categorias: [{ id: eletrica.id, nome: "Elétrica" }],
      criadoPor: { id: sindicoAId, nome: "Carlos", perfil: "SINDICO" },
      titulo: "Lâmpada queimada no hall",
      status: "ABERTO",
      urgencia: "NORMAL",
      exigeNotaFiscal: true,
      fotos: [],
      formularios: [],
      notasFiscais: [],
      comprovantesPagamento: [],
      comprovacoes: [],
      totalPropostas: 0,
      propostas: [],
      localizacao: { precisao: "EXATA", latitude: -9.66, longitude: -35.71 },
    });
    expect(res.body.eventos).toEqual([
      expect.objectContaining({ tipo: "ABERTO", texto: "Aberta por Carlos", marco: true }),
    ]);
    const prazo = new Date(res.body.prazoPropostasAte).getTime() - Date.now();
    expect(prazo).toBeGreaterThan(47.9 * 3_600_000);
    expect(prazo).toBeLessThanOrEqual(48 * 3_600_000);
  });

  it("urgente usa o prazo informado (padrão 2 h)", async () => {
    const padrao = await sindicoA().post("/ordens", corpo({ urgencia: "URGENTE" }));
    const h = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3_600_000;
    expect(h(padrao.body.prazoPropostasAte)).toBeCloseTo(2, 1);
    const quatro = await sindicoA().post(
      "/ordens",
      corpo({ urgencia: "URGENTE", prazoUrgenteHoras: 4 }),
    );
    expect(h(quatro.body.prazoPropostasAte)).toBeCloseTo(4, 1);
  });

  it("zelador só abre tipos liberados; uso interno só a administradora", async () => {
    const negado = await zelador().post("/ordens", corpo());
    expect(negado.status).toBe(403);
    expect(negado.body.erro.codigo).toBe("TIPO_NAO_PERMITIDO");
    expect((await zelador().post("/ordens", corpo({ categoriaIds: [limpeza.id] }))).status).toBe(
      201,
    );
    expect(
      (await sindicoA().post("/ordens", corpo({ categoriaIds: [ti.id] }))).body.erro.codigo,
    ).toBe("TIPO_NAO_PERMITIDO");
    expect(
      (await adm().post("/ordens", corpo({ categoriaIds: [ti.id, eletrica.id] }))).status,
    ).toBe(201);
  });

  it("não abre em condomínio fora do escopo nem inativo; prestador não abre", async () => {
    const fora = await sindicoB().post("/ordens", corpo());
    expect(fora.status).toBe(403);
    expect(fora.body.erro.codigo).toBe("CONDOMINIO_INVALIDO");
    await prisma.condominio.update({ where: { id: A.id }, data: { ativo: false } });
    expect((await adm().post("/ordens", corpo())).body.erro.codigo).toBe("CONDOMINIO_INATIVO");
    expect((await prest().post("/ordens", corpo())).status).toBe(403);
  });

  it("valida campos (sem tipo → 400)", async () => {
    const res = await sindicoA().post("/ordens", corpo({ categoriaIds: [] }));
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe("VALIDACAO");
  });
});

describe("escopo (LGPD)", () => {
  async function cenario() {
    const doA = await criarOrdem({
      condominioId: A.id,
      criadoPorId: sindicoAId,
      categoriaIds: [eletrica.id],
      titulo: "Do A",
    });
    const doZelador = await criarOrdem({
      condominioId: A.id,
      criadoPorId: zeladorId,
      perfilCriador: "ZELADOR",
      categoriaIds: [limpeza.id],
      titulo: "Do zelador",
    });
    const doB = await criarOrdem({
      condominioId: B.id,
      criadoPorId: admId,
      categoriaIds: [eletrica.id],
      titulo: "Do B",
      urgencia: "URGENTE",
    });
    return { doA, doZelador, doB };
  }
  const titulos = (body: { titulo: string }[]) => body.map((o) => o.titulo).sort();

  it("cada perfil lista só o que lhe cabe", async () => {
    await cenario();
    expect(titulos((await adm().get("/ordens")).body)).toEqual(["Do A", "Do B", "Do zelador"]);
    expect(titulos((await sindicoA().get("/ordens")).body)).toEqual(["Do A", "Do zelador"]);
    expect(titulos((await fiscalA().get("/ordens")).body)).toEqual(["Do A", "Do zelador"]);
    expect(titulos((await zelador().get("/ordens")).body)).toEqual(["Do zelador"]);
    expect(titulos((await sindicoB().get("/ordens")).body)).toEqual(["Do B"]);
    expect((await prest().get("/ordens")).status).toBe(403);
  });

  it("detalhe fora do escopo → 404 (não revela que existe)", async () => {
    const { doA, doB } = await cenario();
    expect((await sindicoB().get(`/ordens/${doA.id}`)).status).toBe(404);
    expect((await sindicoA().get(`/ordens/${doB.id}`)).status).toBe(404);
    expect((await zelador().get(`/ordens/${doA.id}`)).status).toBe(404);
    expect((await sindicoA().get(`/ordens/${doA.id}`)).status).toBe(200);
  });

  it("zelador aprovador vê as ordens do condomínio que aguardam a decisão dele", async () => {
    const { doA } = await cenario();
    await prisma.condominio.update({ where: { id: A.id }, data: { aprovadorId: zeladorId } });
    expect(titulos((await zelador().get("/ordens")).body)).toEqual(["Do A", "Do zelador"]);
    expect((await zelador().get(`/ordens/${doA.id}`)).status).toBe(200);
  });

  it("urgentes primeiro; filtros por situação, tipo e busca (inclusive pelo número)", async () => {
    const { doA } = await cenario();
    const lista = (await adm().get("/ordens")).body;
    expect(lista[0].titulo).toBe("Do B");
    expect(titulos((await adm().get(`/ordens?categoriaId=${limpeza.id}`)).body)).toEqual([
      "Do zelador",
    ]);
    expect((await adm().get("/ordens?status=CONCLUIDO")).body).toEqual([]);
    expect(titulos((await adm().get("/ordens?busca=zelador")).body)).toEqual(["Do zelador"]);
    expect(titulos((await adm().get(`/ordens?busca=%23${doA.numero}`)).body)).toEqual(["Do A"]);
  });

  it("lista traz totalPropostas, menorValor e valorContratado", async () => {
    const { doA } = await cenario();
    const outro = await criarPrestador({ categoriaIds: [eletrica.id] });
    await criarProposta({ ordemId: doA.id, prestadorId, valor: 300 });
    await criarProposta({
      ordemId: doA.id,
      prestadorId: outro.id,
      valor: 250,
      status: "CANCELADA",
    });
    const item = (await adm().get("/ordens")).body.find((o: { id: string }) => o.id === doA.id);
    expect(item).toMatchObject({ totalPropostas: 1, menorValor: 300 });
    expect(item.valorContratado).toBeUndefined();
  });
});

describe("visão do prestador", () => {
  it("no mural vê só a região aproximada, sem nome do condomínio nem local", async () => {
    const o = await criarOrdem({
      condominioId: A.id,
      criadoPorId: admId,
      categoriaIds: [eletrica.id],
    });
    const res = await prest().get(`/ordens/${o.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      local: "",
      condominio: { nome: "", endereco: "", bairro: "Ponta Verde", aprovador: null },
      localizacao: { precisao: "APROXIMADA", latitude: -9.66, longitude: -35.71 },
      eventos: [],
      propostas: [],
    });
    expect(res.body.localizacao.endereco).toBeUndefined();
    expect(res.body.condominio.latitude).toBeUndefined();
    expect(res.body.menorValor).toBeUndefined();
  });

  it("de tipo que não atende ou fora do prazo → 404", async () => {
    const outroTipo = await criarOrdem({
      condominioId: A.id,
      criadoPorId: admId,
      categoriaIds: [limpeza.id],
    });
    const vencida = await criarOrdem({
      condominioId: A.id,
      criadoPorId: admId,
      categoriaIds: [eletrica.id],
      prazoHoras: -1,
    });
    expect((await prest().get(`/ordens/${outroTipo.id}`)).status).toBe(404);
    expect((await prest().get(`/ordens/${vencida.id}`)).status).toBe(404);
  });

  it("aprovado (proposta ACEITA) vê o endereço exato e a linha do tempo", async () => {
    const o = await criarOrdem({
      condominioId: A.id,
      criadoPorId: admId,
      categoriaIds: [eletrica.id],
      status: "EM_EXECUCAO",
    });
    await criarProposta({ ordemId: o.id, prestadorId, status: "ACEITA", valor: 420 });
    const res = await prest().get(`/ordens/${o.id}`);
    expect(res.body).toMatchObject({
      local: "Bloco A",
      condominio: { nome: "Palmeiras" },
      localizacao: { precisao: "EXATA" },
      valorContratado: 420,
      minhaProposta: { status: "ACEITA", valor: 420, prestador: { razaoSocial: "Eletro Silva" } },
      propostas: [],
    });
  });
});

describe("cancelar", () => {
  it("gestor cancela (evento marco); fiscal não pode; 2ª vez → 409", async () => {
    const o = await criarOrdem({
      condominioId: A.id,
      criadoPorId: sindicoAId,
      categoriaIds: [eletrica.id],
    });
    expect((await fiscalA().patch(`/ordens/${o.id}/cancelar`)).status).toBe(403);
    const res = await sindicoA().patch(`/ordens/${o.id}/cancelar`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELADO");
    expect(res.body.eventos.at(-1)).toMatchObject({ tipo: "CANCELADO", marco: true });
    const de_novo = await sindicoA().patch(`/ordens/${o.id}/cancelar`);
    expect(de_novo.status).toBe(409);
    const gravada = await prisma.ordem.findUnique({ where: { id: o.id } });
    expect(gravada?.canceladoPorId).toBe(sindicoAId);
  });

  it("síndico de outro condomínio não cancela (404)", async () => {
    const o = await criarOrdem({
      condominioId: A.id,
      criadoPorId: sindicoAId,
      categoriaIds: [eletrica.id],
    });
    expect((await sindicoB().patch(`/ordens/${o.id}/cancelar`)).status).toBe(404);
  });
});
