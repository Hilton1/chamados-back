import { beforeEach, describe, expect, it } from "vitest";
import { emailsClerk } from "./helpers/clerk.js";
import {
  cnpjValido,
  criarCategoria,
  criarCondominio,
  criarPessoa,
  criarPrestador,
  limparBanco,
  prisma,
} from "./helpers/db.js";
import { como } from "./helpers/http.js";

const ADM = "user_adm";
const adm = () => como(ADM);
let admId: string;

beforeEach(async () => {
  await limparBanco();
  admId = (await criarPessoa({ nome: "Yasmin", administradora: true, clerk: ADM })).id;
});

describe("tipos de serviço (/categorias)", () => {
  it("lista só ativos por padrão e todos com ?todas=1, em ordem de nome", async () => {
    await criarCategoria({ nome: "Piscina" });
    await criarCategoria({ nome: "Elétrica" });
    await criarCategoria({ nome: "Antigo", ativa: false });
    const ativos = await adm().get("/categorias");
    expect(ativos.body.map((c: { nome: string }) => c.nome)).toEqual(["Elétrica", "Piscina"]);
    const todos = await adm().get("/categorias?todas=1");
    expect(todos.body).toHaveLength(3);
    expect(todos.body[0]).toEqual({
      id: expect.any(String),
      slug: expect.any(String),
      nome: "Antigo",
      interna: false,
      zeladorPodeAbrir: false,
      ativa: false,
    });
  });

  it("qualquer sessão lê (autocadastro), mesmo sem conta", async () => {
    await criarCategoria();
    expect((await como("user_sem_conta").get("/categorias")).status).toBe(200);
  });

  it("administradora cria e edita; nome repetido → 409; slug não muda", async () => {
    const criado = await adm().post("/categorias", {
      nome: "Jardinagem",
      interna: false,
      zeladorPodeAbrir: true,
      ativa: true,
    });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({ slug: "jardinagem", zeladorPodeAbrir: true });

    const dup = await adm().post("/categorias", {
      nome: "jardinagem",
      interna: false,
      zeladorPodeAbrir: false,
      ativa: true,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.erro.codigo).toBe("CATEGORIA_DUPLICADA");

    const editado = await adm().patch(`/categorias/${criado.body.id}`, {
      nome: "Jardins",
      interna: false,
      zeladorPodeAbrir: false,
      ativa: false,
    });
    expect(editado.body).toMatchObject({ nome: "Jardins", slug: "jardinagem", ativa: false });
  });

  it("só a administradora grava", async () => {
    const c = await criarCondominio();
    await criarPessoa({
      clerk: "user_sind",
      vinculos: [{ condominioId: c.id, perfil: "SINDICO" }],
    });
    const res = await como("user_sind").post("/categorias", {
      nome: "X",
      interna: false,
      zeladorPodeAbrir: false,
      ativa: true,
    });
    expect(res.status).toBe(403);
  });

  it("/categorias/uso conta prestadores aprovados e ativos", async () => {
    const a = await criarCategoria();
    const b = await criarCategoria();
    await criarPrestador({ categoriaIds: [a.id, b.id] });
    await criarPrestador({ categoriaIds: [a.id] });
    await criarPrestador({ categoriaIds: [a.id], status: "PENDENTE" });
    await criarPrestador({ categoriaIds: [a.id], ativo: false });
    const res = await adm().get("/categorias/uso");
    expect(res.body).toEqual({ [a.id]: 2, [b.id]: 1 });
  });
});

describe("condomínios", () => {
  const corpo = {
    nome: "Residencial Jardim das Palmeiras",
    cnpj: "11.222.333/0001-81",
    endereco: "Rua das Palmeiras, 120",
    bairro: "Ponta Verde",
    cidade: "Maceió",
    uf: "al",
    latitude: -9.6658,
    longitude: -35.7128,
    ativo: true,
    aprovadorId: null,
  };

  it("cria com a administradora aprovando e devolve no formato do front", async () => {
    const res = await adm().post("/condominios", corpo);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      nome: corpo.nome,
      cnpj: "11222333000181",
      endereco: corpo.endereco,
      bairro: "Ponta Verde",
      cidade: "Maceió",
      uf: "AL",
      latitude: -9.6658,
      longitude: -35.7128,
      ativo: true,
      aprovador: null,
    });
  });

  it("não aceita aprovador na criação nem CNPJ repetido", async () => {
    const p = await criarPessoa();
    expect(
      (await adm().post("/condominios", { ...corpo, aprovadorId: p.id })).body.erro.codigo,
    ).toBe("APROVADOR_INVALIDO");
    await adm().post("/condominios", corpo);
    const dup = await adm().post("/condominios", { ...corpo, nome: "Outro" });
    expect(dup.status).toBe(409);
    expect(dup.body.erro.codigo).toBe("CNPJ_DUPLICADO");
  });

  it("aprovador precisa ser pessoa ativa vinculada ao condomínio", async () => {
    const c = await criarCondominio();
    const outro = await criarCondominio();
    const carlos = await criarPessoa({
      nome: "Carlos",
      vinculos: [{ condominioId: c.id, perfil: "SINDICO" }],
    });
    const deFora = await criarPessoa({ vinculos: [{ condominioId: outro.id, perfil: "SINDICO" }] });
    const inativo = await criarPessoa({
      ativo: false,
      vinculos: [{ condominioId: c.id, perfil: "FISCAL" }],
    });
    const body = { ...corpo, cnpj: undefined };

    for (const id of [deFora.id, inativo.id]) {
      const r = await adm().patch(`/condominios/${c.id}`, { ...body, aprovadorId: id });
      expect(r.status).toBe(409);
      expect(r.body.erro.codigo).toBe("APROVADOR_INVALIDO");
    }
    const ok = await adm().patch(`/condominios/${c.id}`, { ...body, aprovadorId: carlos.id });
    expect(ok.body.aprovador).toEqual({ id: carlos.id, nome: "Carlos" });
    expect(ok.body.cnpj).toBeUndefined();
  });

  it("lista ativos primeiro; GET por id; 404; só ADMIN", async () => {
    await criarCondominio({ nome: "Z" });
    await criarCondominio({ nome: "A", ativo: false });
    const lista = await adm().get("/condominios");
    expect(lista.body.map((c: { nome: string }) => c.nome)).toEqual(["Z", "A"]);
    expect((await adm().get(`/condominios/${lista.body[0].id}`)).body.nome).toBe("Z");
    expect((await adm().get("/condominios/00000000-0000-4000-8000-000000000000")).status).toBe(404);

    const c = await criarCondominio();
    await criarPessoa({
      clerk: "user_sind",
      vinculos: [{ condominioId: c.id, perfil: "SINDICO" }],
    });
    expect((await como("user_sind").get("/condominios")).status).toBe(403);
  });
});

describe("pessoas", () => {
  const corpo = (condominioId: string) => ({
    nome: "Carlos Mendes",
    email: " Carlos@Palmeiras.com ",
    telefone: "+55 (82) 99900-0002",
    administradora: false,
    vinculos: [{ condominioId, perfil: "SINDICO" }],
    ativo: true,
  });

  it("cria com vínculos e devolve no formato do front", async () => {
    const c = await criarCondominio();
    const res = await adm().post("/pessoas", corpo(c.id));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      nome: "Carlos Mendes",
      email: "carlos@palmeiras.com",
      telefone: "5582999000002",
      administradora: false,
      vinculos: [{ condominioId: c.id, perfil: "SINDICO" }],
      ativo: true,
      contaCriada: false,
    });
  });

  it("valida e-mail único, acesso mínimo e um perfil por condomínio", async () => {
    const c = await criarCondominio();
    await criarPrestador({ email: "carlos@palmeiras.com" });
    expect((await adm().post("/pessoas", corpo(c.id))).body.erro.codigo).toBe("EMAIL_DUPLICADO");

    const semAcesso = await adm().post("/pessoas", {
      ...corpo(c.id),
      email: "x@x.com",
      vinculos: [],
    });
    expect(semAcesso.body.erro.codigo).toBe("SEM_ACESSO");

    const repetido = await adm().post("/pessoas", {
      ...corpo(c.id),
      email: "y@y.com",
      vinculos: [
        { condominioId: c.id, perfil: "SINDICO" },
        { condominioId: c.id, perfil: "FISCAL" },
      ],
    });
    expect(repetido.status).toBe(400);
  });

  it("não deixa desativar nem desvincular quem aprova (409 PESSOA_E_APROVADORA)", async () => {
    const c = await criarCondominio({ nome: "Palmeiras" });
    const outro = await criarCondominio();
    const criado = await adm().post("/pessoas", corpo(c.id));
    await prisma.condominio.update({ where: { id: c.id }, data: { aprovadorId: criado.body.id } });

    const desativar = await adm().patch(`/pessoas/${criado.body.id}`, {
      ...corpo(c.id),
      ativo: false,
    });
    expect(desativar.status).toBe(409);
    expect(desativar.body.erro.codigo).toBe("PESSOA_E_APROVADORA");
    expect(desativar.body.erro.mensagem).toContain("Palmeiras");

    const desvincular = await adm().patch(`/pessoas/${criado.body.id}`, {
      ...corpo(outro.id),
    });
    expect(desvincular.body.erro.codigo).toBe("PESSOA_E_APROVADORA");

    // Trocar o perfil no mesmo condomínio continua valendo
    const trocar = await adm().patch(`/pessoas/${criado.body.id}`, {
      ...corpo(c.id),
      vinculos: [
        { condominioId: c.id, perfil: "FISCAL" },
        { condominioId: outro.id, perfil: "ZELADOR" },
      ],
    });
    expect(trocar.status).toBe(200);
    expect(trocar.body.vinculos).toHaveLength(2);
  });

  it("a administradora não desativa a própria conta", async () => {
    const res = await adm().patch(`/pessoas/${admId}`, {
      nome: "Yasmin",
      email: "yasmin@adm.com",
      administradora: true,
      vinculos: [],
      ativo: false,
    });
    expect(res.body.erro.codigo).toBe("PROPRIA_CONTA");
  });

  it("lista sem as contas de prestador; contaCriada após o 1º login", async () => {
    const c = await criarCondominio();
    await criarPrestador();
    const criado = await adm().post("/pessoas", corpo(c.id));
    const lista = await adm().get("/pessoas");
    expect(lista.body.map((p: { nome: string }) => p.nome).sort()).toEqual([
      "Carlos Mendes",
      "Yasmin",
    ]);

    emailsClerk.set("user_carlos", "carlos@palmeiras.com");
    await como("user_carlos").get("/me");
    expect((await adm().get(`/pessoas/${criado.body.id}`)).body.contaCriada).toBe(true);
  });
});

describe("prestadores", () => {
  const corpo = async () => {
    const cat = await criarCategoria({ nome: "Elétrica" });
    return {
      cat,
      body: {
        razaoSocial: "Eletro Silva Instalações",
        documento: cnpjValido(),
        nomeContato: "Raimundo Silva",
        email: "contato@eletrosilva.com",
        telefoneWhatsapp: "+5582999990001",
        emiteNotaFiscal: true,
        areaAtuacao: "Maceió",
        categoriaIds: [cat.id],
      },
    };
  };

  it("cadastro pela administradora já entra aprovado e liga a conta no 1º login", async () => {
    const { body, cat } = await corpo();
    const res = await adm().post("/prestadores", body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      razaoSocial: body.razaoSocial,
      documento: body.documento,
      nomeContato: "Raimundo Silva",
      email: "contato@eletrosilva.com",
      telefoneWhatsapp: "5582999990001",
      emiteNotaFiscal: true,
      areaAtuacao: "Maceió",
      categoriaIds: [cat.id],
      status: "APROVADO",
      ativo: true,
      origem: "ADMINISTRADORA",
      contaCriada: false,
      mediaAvaliacao: 0,
      totalAvaliacoes: 0,
      totalServicos: 0,
      createdAt: expect.any(String),
    });

    emailsClerk.set("user_raimundo", "contato@eletrosilva.com");
    const me = await como("user_raimundo").get("/me");
    expect(me.body.prestador).toMatchObject({ id: res.body.id, status: "APROVADO" });
    expect((await como("user_raimundo").get("/prestadores/me")).body.contaCriada).toBe(true);
  });

  it("recusa sem nota fiscal, documento e e-mail repetidos", async () => {
    const { body } = await corpo();
    expect(
      (await adm().post("/prestadores", { ...body, emiteNotaFiscal: false })).body.erro.codigo,
    ).toBe("SEM_NOTA_FISCAL");
    await adm().post("/prestadores", body);
    expect(
      (await adm().post("/prestadores", { ...body, email: "outro@x.com" })).body.erro.codigo,
    ).toBe("DOCUMENTO_DUPLICADO");
    expect(
      (await adm().post("/prestadores", { ...body, documento: cnpjValido() })).body.erro.codigo,
    ).toBe("EMAIL_DUPLICADO");
  });

  it("lista com filtros: situação, tipo e busca; pendentes primeiro", async () => {
    const a = await criarCategoria();
    const b = await criarCategoria();
    await criarPrestador({ razaoSocial: "Beta", categoriaIds: [a.id] });
    await criarPrestador({ razaoSocial: "Alfa", categoriaIds: [b.id], status: "PENDENTE" });
    await criarPrestador({ razaoSocial: "Gama", categoriaIds: [a.id], ativo: false });

    const nomes = async (qs: string) =>
      (await adm().get(`/prestadores${qs}`)).body.map(
        (p: { razaoSocial: string }) => p.razaoSocial,
      );
    expect(await nomes("")).toEqual(["Alfa", "Beta", "Gama"]);
    expect(await nomes("?situacao=ATIVO")).toEqual(["Beta"]);
    expect(await nomes("?situacao=PENDENTE")).toEqual(["Alfa"]);
    expect(await nomes("?situacao=INATIVO")).toEqual(["Gama"]);
    expect(await nomes(`?categoriaId=${a.id}`)).toEqual(["Beta", "Gama"]);
    expect(await nomes("?busca=bet")).toEqual(["Beta"]);
  });

  it("síndico consulta, mas não cadastra nem aprova; fiscal não consulta", async () => {
    const c = await criarCondominio();
    await criarPessoa({
      clerk: "user_sind",
      vinculos: [{ condominioId: c.id, perfil: "SINDICO" }],
    });
    await criarPessoa({ clerk: "user_fisc", vinculos: [{ condominioId: c.id, perfil: "FISCAL" }] });
    const p = await criarPrestador({ status: "PENDENTE" });
    expect((await como("user_sind").get("/prestadores")).status).toBe(200);
    expect((await como("user_sind").get(`/prestadores/${p.id}`)).status).toBe(200);
    expect((await como("user_sind").patch(`/prestadores/${p.id}/aprovar`)).status).toBe(403);
    expect((await como("user_fisc").get("/prestadores")).status).toBe(403);
  });

  it("aprovar exige nota fiscal; desativar com motivo e reativar", async () => {
    const semNf = await criarPrestador({ status: "PENDENTE", emiteNotaFiscal: false });
    expect((await adm().patch(`/prestadores/${semNf.id}/aprovar`)).body.erro.codigo).toBe(
      "SEM_NOTA_FISCAL",
    );

    const p = await criarPrestador({ status: "PENDENTE", clerk: "user_p" });
    expect((await adm().patch(`/prestadores/${p.id}/aprovar`)).body.status).toBe("APROVADO");

    const off = await adm().patch(`/prestadores/${p.id}/desativar`, { motivo: "Não atende mais" });
    expect(off.body).toMatchObject({ ativo: false, motivoInativacao: "Não atende mais" });
    expect((await como("user_p").get("/me")).status).toBe(403);
    expect((await como("user_p").get("/prestadores/me")).status).toBe(403);

    const on = await adm().patch(`/prestadores/${p.id}/reativar`);
    expect(on.body.ativo).toBe(true);
    expect(on.body.motivoInativacao).toBeUndefined();
  });

  it("edição pela administradora mantém documento antigo e valida o novo", async () => {
    const { body } = await corpo();
    const criado = await adm().post("/prestadores", body);
    await prisma.prestador.update({
      where: { id: criado.body.id },
      data: { documento: "11222333000144" },
    });
    const mantido = await adm().patch(`/prestadores/${criado.body.id}`, {
      ...body,
      documento: "11.222.333/0001-44",
      razaoSocial: "Eletro Silva",
    });
    expect(mantido.status).toBe(200);
    expect(mantido.body.razaoSocial).toBe("Eletro Silva");
    const novoInvalido = await adm().patch(`/prestadores/${criado.body.id}`, {
      ...body,
      documento: "11222333000199",
    });
    expect(novoInvalido.body.erro.codigo).toBe("DOCUMENTO_INVALIDO");
  });

  it("meu cadastro: prestador vê e edita o próprio (sem documento/e-mail)", async () => {
    const a = await criarCategoria();
    const b = await criarCategoria();
    const p = await criarPrestador({ clerk: "user_p", categoriaIds: [a.id] });
    const res = await como("user_p").patch("/prestadores/me", {
      razaoSocial: "Nova Razão",
      nomeContato: "Novo Contato",
      telefoneWhatsapp: "82 98888-0000",
      emiteNotaFiscal: false,
      areaAtuacao: "Arapiraca",
      categoriaIds: [a.id, b.id],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: p.id,
      razaoSocial: "Nova Razão",
      nomeContato: "Novo Contato",
      telefoneWhatsapp: "5582988880000",
      emiteNotaFiscal: false,
      status: "APROVADO",
      documento: p.documento,
    });
    expect(res.body.categoriaIds.sort()).toEqual([a.id, b.id].sort());
    // pessoa sem perfil de prestador não acessa
    expect((await adm().get("/prestadores/me")).status).toBe(403);
  });

  it("totalServicos conta ordens concluídas com a proposta aceita", async () => {
    const c = await criarCondominio();
    const p = await criarPrestador();
    for (const status of ["CONCLUIDO", "CONCLUIDO", "EM_EXECUCAO"] as const) {
      const o = await prisma.ordem.create({
        data: {
          condominioId: c.id,
          criadoPorId: admId,
          perfilCriador: "ADMIN",
          titulo: "Troca de lâmpadas",
          descricao: "Hall",
          local: "Hall",
          status,
          prazoPropostasAte: new Date(),
        },
      });
      await prisma.proposta.create({
        data: {
          ordemId: o.id,
          prestadorId: p.id,
          valor: 100,
          disponivelEm: new Date(),
          tempoExecucaoHoras: 2,
          status: "ACEITA",
        },
      });
    }
    expect((await adm().get(`/prestadores/${p.id}`)).body.totalServicos).toBe(2);
  });
});
