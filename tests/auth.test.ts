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
import { anonimo, como } from "./helpers/http.js";

beforeEach(limparBanco);

describe("autenticação", () => {
  it("sem token → 401", async () => {
    const res = await anonimo().get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.erro.codigo).toBe("NAO_AUTENTICADO");
  });

  it("sessão sem cadastro → 404 no /me e 403 nas demais rotas", async () => {
    expect((await como("user_novo").get("/me")).status).toBe(404);
    const res = await como("user_novo").get("/categorias/uso");
    expect(res.status).toBe(403);
    expect(res.body.erro.codigo).toBe("SEM_CADASTRO");
  });

  it("1º login liga o pré-cadastro pelo e-mail verificado", async () => {
    const c = await criarCondominio({ nome: "Palmeiras" });
    const p = await criarPessoa({
      email: "carlos@teste.com",
      vinculos: [{ condominioId: c.id, perfil: "SINDICO" }],
    });
    emailsClerk.set("user_carlos", "carlos@teste.com");

    const res = await como("user_carlos").get("/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: p.id,
      email: "carlos@teste.com",
      administradora: false,
      vinculos: [
        { perfil: "SINDICO", condominio: { id: c.id, nome: "Palmeiras", aprovador: null } },
      ],
    });
    expect(res.body.prestador).toBeUndefined();
    expect(res.body.condominiosAdministrados).toBeUndefined();
    const salvo = await prisma.usuario.findUnique({ where: { id: p.id } });
    expect(salvo?.clerkUserId).toBe("user_carlos");
  });

  it("e-mail não verificado não liga a conta", async () => {
    await criarPessoa({ email: "marta@teste.com", administradora: true });
    // emailsClerk sem a entrada = e-mail não verificado no Clerk
    expect((await como("user_marta").get("/me")).status).toBe(404);
  });

  it("não liga a um pré-cadastro já ligado a outra conta do Clerk", async () => {
    await criarPessoa({ email: "ana@teste.com", administradora: true, clerk: "user_ana" });
    emailsClerk.set("user_outro", "ana@teste.com");
    expect((await como("user_outro").get("/me")).status).toBe(404);
  });

  it("pessoa desativada → 403 no /me e nas rotas", async () => {
    await criarPessoa({ administradora: true, ativo: false, clerk: "user_off" });
    const me = await como("user_off").get("/me");
    expect(me.status).toBe(403);
    expect(me.body.erro.codigo).toBe("ACESSO_DESATIVADO");
    expect((await como("user_off").get("/categorias/uso")).status).toBe(403);
  });

  it("prestador desativado → 403 no /me", async () => {
    await criarPrestador({ clerk: "user_prest", ativo: false });
    expect((await como("user_prest").get("/me")).status).toBe(403);
  });

  it("administradora recebe os condomínios ativos", async () => {
    await criarCondominio({ nome: "B" });
    await criarCondominio({ nome: "A" });
    await criarCondominio({ nome: "Inativo", ativo: false });
    await criarPessoa({ administradora: true, clerk: "user_adm" });
    const res = await como("user_adm").get("/me");
    expect(res.body.condominiosAdministrados.map((c: { nome: string }) => c.nome)).toEqual([
      "A",
      "B",
    ]);
  });

  it("prestador recebe status e tipos de serviço no /me", async () => {
    const cat = await criarCategoria();
    const p = await criarPrestador({ clerk: "user_p", status: "PENDENTE", categoriaIds: [cat.id] });
    const res = await como("user_p").get("/me");
    expect(res.body.prestador).toEqual({
      id: p.id,
      status: "PENDENTE",
      ativo: true,
      categoriaIds: [cat.id],
    });
  });
});

describe("perfil ativo (X-Perfil)", () => {
  it("usa o perfil pedido quando a pessoa o tem; senão cai no padrão", async () => {
    const c = await criarCondominio();
    await criarPessoa({
      administradora: true,
      clerk: "user_marta",
      vinculos: [{ condominioId: c.id, perfil: "FISCAL" }],
    });
    // ADMIN (padrão) acessa cadastros
    expect((await como("user_marta").get("/categorias/uso")).status).toBe(200);
    // Atuando como FISCAL, não
    const fiscal = await como("user_marta", "FISCAL").get("/categorias/uso");
    expect(fiscal.status).toBe(403);
    expect(fiscal.body.erro.codigo).toBe("PERFIL_SEM_PERMISSAO");
    // Perfil que ela não tem: ignora e usa o padrão (ADMIN)
    expect((await como("user_marta", "SINDICO").get("/categorias/uso")).status).toBe(200);
  });

  it("pessoa sem vínculo e fora da administradora → 403 SEM_ACESSO", async () => {
    await criarPessoa({ clerk: "user_solto" });
    const res = await como("user_solto").get("/prestadores");
    expect(res.status).toBe(403);
    expect(res.body.erro.codigo).toBe("SEM_ACESSO");
  });

  it("CORS libera o cabeçalho X-Perfil para o front", async () => {
    const res = await anonimo()
      .options("/api/me")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization,x-perfil");
    expect(res.headers["access-control-allow-headers"]).toMatch(/X-Perfil/i);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});

describe("POST /prestadores/cadastro (autocadastro)", () => {
  const corpo = async () => {
    const cat = await criarCategoria({ nome: "Elétrica" });
    return {
      cat,
      body: {
        razaoSocial: "Piscinas Azul",
        documento: "529.982.247-25",
        nomeContato: "Joana",
        telefoneWhatsapp: "+55 (82) 98888-7777",
        emiteNotaFiscal: true,
        areaAtuacao: "Maceió",
        categoriaIds: [cat.id],
      },
    };
  };

  it("cria conta + prestador PENDENTE com o e-mail verificado", async () => {
    const { body, cat } = await corpo();
    emailsClerk.set("user_joana", "Joana@Teste.com");
    const res = await como("user_joana").post("/prestadores/cadastro", body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      razaoSocial: "Piscinas Azul",
      documento: "52998224725",
      email: "joana@teste.com",
      nomeContato: "Joana",
      telefoneWhatsapp: "5582988887777",
      status: "PENDENTE",
      origem: "AUTOCADASTRO",
      ativo: true,
      contaCriada: true,
      categoriaIds: [cat.id],
      totalServicos: 0,
    });
    const me = await como("user_joana").get("/me");
    expect(me.body.prestador.status).toBe("PENDENTE");
  });

  it("recusa CPF/CNPJ inválido", async () => {
    const { body } = await corpo();
    emailsClerk.set("user_x", "x@teste.com");
    const res = await como("user_x").post("/prestadores/cadastro", {
      ...body,
      documento: "11111111111",
    });
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe("VALIDACAO");
  });

  it("exige informar se emite nota fiscal", async () => {
    const { body } = await corpo();
    emailsClerk.set("user_x", "x@teste.com");
    const { emiteNotaFiscal: _, ...sem } = body;
    expect((await como("user_x").post("/prestadores/cadastro", sem)).status).toBe(400);
  });

  it("recusa tipo de serviço de uso interno", async () => {
    const { body } = await corpo();
    const ti = await criarCategoria({ nome: "TI", interna: true });
    emailsClerk.set("user_x", "x@teste.com");
    const res = await como("user_x").post("/prestadores/cadastro", {
      ...body,
      categoriaIds: [ti.id],
    });
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe("CATEGORIA_INVALIDA");
  });

  it("e-mail não verificado → 403", async () => {
    const { body } = await corpo();
    const res = await como("user_sem_email").post("/prestadores/cadastro", body);
    expect(res.status).toBe(403);
    expect(res.body.erro.codigo).toBe("EMAIL_NAO_VERIFICADO");
  });

  it("segundo cadastro → 409 JA_CADASTRADO; documento repetido → 409", async () => {
    const { body } = await corpo();
    emailsClerk.set("user_a", "a@teste.com");
    expect((await como("user_a").post("/prestadores/cadastro", body)).status).toBe(201);
    const de_novo = await como("user_a").post("/prestadores/cadastro", {
      ...body,
      documento: cnpjValido(),
    });
    expect(de_novo.body.erro.codigo).toBe("JA_CADASTRADO");
    emailsClerk.set("user_b", "b@teste.com");
    const dup = await como("user_b").post("/prestadores/cadastro", body);
    expect(dup.status).toBe(409);
    expect(dup.body.erro.codigo).toBe("DOCUMENTO_DUPLICADO");
  });
});
