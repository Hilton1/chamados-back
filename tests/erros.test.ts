// Contrato de erro: todo erro que o cliente provoca vira `{ erro: { codigo, mensagem } }` com o
// status certo e mensagem em português; erro inesperado vira 500 genérico (sem detalhes internos).
import { Prisma } from "@prisma/client";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { tratarErro } from "../src/middlewares/erro.js";
import { PNG } from "./helpers/arquivos.js";
import {
  criarCategoria,
  criarCondominio,
  criarOrdem,
  criarPessoa,
  criarPrestador,
  limparBanco,
} from "./helpers/db.js";
import { anonimo, bruto, como } from "./helpers/http.js";
import { limparStorage } from "./helpers/storage.js";

/** Nada de inglês técnico nem detalhes do Prisma/Zod na mensagem. */
const INGLES = /\b(invalid|expected|received|undefined|prisma|zod|error|unexpected token)\b/i;

describe("corpo e rotas (express)", () => {
  it("rota inexistente → 404 JSON", async () => {
    const res = await anonimo().get("/nao-existe");
    expect(res.status).toBe(404);
    expect(res.body.erro).toMatchObject({ codigo: "ROTA_NAO_ENCONTRADA" });
  });

  it("JSON malformado → 400 JSON_INVALIDO", async () => {
    const res = await anonimo()
      .post("/api/pessoas")
      .set("Content-Type", "application/json")
      .send('{"nome": ');
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe("JSON_INVALIDO");
    expect(res.body.erro.mensagem).not.toMatch(INGLES);
  });

  it("corpo acima do limite → 413 CORPO_GRANDE com o limite", async () => {
    const res = await anonimo()
      .post("/api/pessoas")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ nome: "x".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.erro.codigo).toBe("CORPO_GRANDE");
    expect(res.body.erro.mensagem).toContain("100 KB");
  });
});

describe("sessão (Clerk)", () => {
  it("token recusado → 401 com 'sessão expirou'; sem token → 'faça login'", async () => {
    const expirada = await anonimo().get("/api/me").set("Authorization", "Basic xyz");
    expect(expirada.status).toBe(401);
    expect(expirada.body.erro).toEqual({
      codigo: "NAO_AUTENTICADO",
      mensagem: "Sua sessão expirou. Entre novamente.",
    });
    const sem = await anonimo().get("/api/me");
    expect(sem.body.erro.mensagem).toBe("Faça login para continuar.");
  });
});

describe("validação (Zod)", () => {
  beforeEach(async () => {
    await limparBanco();
    await criarPessoa({ administradora: true, clerk: "user_adm" });
  });
  const adm = () => como("user_adm");

  it("1ª falha com nome do campo em português + `campos`", async () => {
    const res = await adm().post("/pessoas", {
      nome: "a",
      email: "x@x.com",
      administradora: true,
      vinculos: [],
      ativo: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toEqual({
      codigo: "VALIDACAO",
      mensagem: "Nome: use pelo menos 2 caracteres.",
      campos: [{ campo: "nome", mensagem: "Use pelo menos 2 caracteres." }],
    });
  });

  it("vários campos faltando: mensagens em português, sem inglês", async () => {
    const res = await adm().post("/pessoas", {});
    expect(res.status).toBe(400);
    expect(res.body.erro.mensagem).toMatch(/^Nome: campo obrigatório \(e mais \d+ campos\)\.$/);
    for (const c of res.body.erro.campos) expect(c.mensagem).not.toMatch(INGLES);
    expect(res.body.erro.campos).toContainEqual({
      campo: "administradora",
      mensagem: "Campo obrigatório.",
    });
  });

  it("tipo errado e opção inválida", async () => {
    const res = await adm().post("/pessoas", {
      nome: "Ana",
      email: "ana@x.com",
      administradora: "sim",
      vinculos: [{ condominioId: "abc", perfil: "MORADOR" }],
      ativo: true,
    });
    const msgs = Object.fromEntries(
      res.body.erro.campos.map((c: { campo: string; mensagem: string }) => [c.campo, c.mensagem]),
    );
    expect(msgs).toEqual({
      administradora: "Precisa ser sim ou não (true/false).",
      "vinculos.0.condominioId": "Identificador inválido.",
      "vinculos.0.perfil": "Opção inválida.",
    });
  });

  it("rota inexistente dentro de /api (com sessão) → 404 JSON", async () => {
    const res = await adm().get("/nao-existe");
    expect(res.status).toBe(404);
    expect(res.body.erro.codigo).toBe("ROTA_NAO_ENCONTRADA");
  });

  it("UUID inválido no caminho → 400 (não 500)", async () => {
    const res = await adm().get("/pessoas/nao-e-uuid");
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatchObject({
      codigo: "VALIDACAO",
      mensagem: "Identificador inválido.",
    });
  });

  it("UUID válido inexistente → 404", async () => {
    const res = await adm().get("/pessoas/00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.erro.codigo).toBe("NAO_ENCONTRADO");
  });
});

describe("upload (multer)", () => {
  let ordemId: string;
  beforeEach(async () => {
    await limparBanco();
    limparStorage();
    const c = await criarCondominio();
    const tipo = await criarCategoria();
    const s = await criarPessoa({
      clerk: "user_sind",
      vinculos: [{ condominioId: c.id, perfil: "SINDICO" }],
    });
    await criarPrestador({ clerk: "user_prest", categoriaIds: [tipo.id] });
    ordemId = (
      await criarOrdem({
        condominioId: c.id,
        criadoPorId: s.id,
        perfilCriador: "SINDICO",
        categoriaIds: [tipo.id],
      })
    ).id;
  });

  it("dois arquivos onde cabe um → 400 'um arquivo por vez'", async () => {
    const res = await bruto("user_sind", "post", `/ordens/${ordemId}/anexos`)
      .attach("arquivo", PNG, "a.png")
      .attach("arquivo", PNG, "b.png");
    expect(res.status).toBe(400);
    expect(res.body.erro).toEqual({
      codigo: "ARQUIVOS_DEMAIS",
      mensagem: "Envie um arquivo por vez.",
    });
  });

  it("acima do máximo da rota → 400 com o limite", async () => {
    const r = bruto("user_prest", "post", `/ordens/${ordemId}/propostas`);
    for (let i = 0; i < 6; i++) r.attach("arquivos", PNG, `${i}.png`);
    const res = await r;
    expect(res.status).toBe(400);
    expect(res.body.erro).toEqual({
      codigo: "ARQUIVOS_DEMAIS",
      mensagem: "Envie no máximo 5 arquivos por vez.",
    });
  });

  it("campo de arquivo errado → 400 indicando o campo certo", async () => {
    const res = await bruto("user_sind", "post", `/ordens/${ordemId}/anexos`).attach(
      "foto",
      PNG,
      "a.png",
    );
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe("CAMPO_DE_ARQUIVO_INVALIDO");
    expect(res.body.erro.mensagem).toContain('"arquivo"');
  });

  it("arquivo acima de 5 MB → 413 com o limite", async () => {
    const res = await bruto("user_sind", "post", `/ordens/${ordemId}/anexos`).attach(
      "arquivo",
      Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]),
      "grande.png",
    );
    expect(res.status).toBe(413);
    expect(res.body.erro.mensagem).toContain("5 MB");
  });

  it("multipart malformado → 400 UPLOAD_INVALIDO", async () => {
    const res = await bruto("user_sind", "post", `/ordens/${ordemId}/anexos`)
      .set("Content-Type", "multipart/form-data; boundary=xyz")
      .send('--xyz\r\nContent-Disposition: form-data; name="arquivo"; filename="a.png"\r\n');
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe("UPLOAD_INVALIDO");
  });
});

// Erros de infraestrutura simulados direto no middleware (banco fora do ar não dá para provocar
// de forma confiável contra o Postgres de teste).
describe("tratarErro: Prisma, Clerk e inesperados", () => {
  const appQueLanca = (err: unknown) => {
    const app = express();
    app.get("/x", () => {
      throw err;
    });
    app.use(tratarErro);
    return app;
  };
  const conhecido = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError(`falha ${code}`, {
      code,
      clientVersion: "6",
      meta,
    });
  const resposta = async (err: unknown) => {
    const res = await request(appQueLanca(err)).get("/x");
    return { status: res.status, ...res.body.erro };
  };

  it.each([
    [
      conhecido("P2002", { target: ["email"] }),
      409,
      "REGISTRO_DUPLICADO",
      "Já existe um cadastro com esse e-mail.",
    ],
    [
      conhecido("P2002", { target: ["documento"] }),
      409,
      "REGISTRO_DUPLICADO",
      "Já existe um prestador com esse CPF/CNPJ.",
    ],
    [
      conhecido("P2025"),
      404,
      "NAO_ENCONTRADO",
      "Não encontramos o registro. Ele pode ter sido removido.",
    ],
    [conhecido("P2003"), 409, "REFERENCIA_INVALIDA", expect.stringContaining("não existe mais")],
    [conhecido("P2023"), 400, "VALIDACAO", "Identificador inválido."],
    [conhecido("P2034"), 409, "ALTERACAO_SIMULTANEA", expect.stringContaining("ao mesmo tempo")],
  ])("Prisma conhecido → status e mensagem (%#)", async (err, status, codigo, mensagem) => {
    expect(await resposta(err)).toEqual({ status, codigo, mensagem });
  });

  const INDISPONIVEL = {
    status: 503,
    codigo: "INDISPONIVEL",
    mensagem: "Serviço temporariamente indisponível. Tente novamente em instantes.",
  };

  it.each([
    ["P1001", conhecido("P1001")],
    ["P1008", conhecido("P1008")],
    ["P2024", conhecido("P2024")],
    ["inicialização", new Prisma.PrismaClientInitializationError("Can't reach database", "6")],
    [
      "prepared statement",
      new Prisma.PrismaClientUnknownRequestError('prepared statement "s0" already exists', {
        clientVersion: "6",
      }),
    ],
  ])("banco indisponível (%s) → 503", async (_nome, err) => {
    expect(await resposta(err)).toEqual(INDISPONIVEL);
  });

  it("Clerk: 401 da API → sessão expirada; outra falha → 503", async () => {
    expect(
      await resposta(Object.assign(new Error("x"), { clerkError: true, status: 401 })),
    ).toEqual({
      status: 401,
      codigo: "NAO_AUTENTICADO",
      mensagem: "Sua sessão expirou. Entre novamente.",
    });
    expect(
      (await resposta(Object.assign(new Error("x"), { clerkError: true, status: 500 }))).status,
    ).toBe(503);
  });

  it("erro inesperado → 500 genérico, sem vazar detalhes", async () => {
    const r = await resposta(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(r).toEqual({
      status: 500,
      codigo: "ERRO_INTERNO",
      mensagem: "Tivemos um problema inesperado. Tente novamente em instantes.",
    });
    // Prisma desconhecido sem sinal de conexão também é 500 genérico.
    const p = await resposta(conhecido("P2999"));
    expect(p.status).toBe(500);
    expect(p.mensagem).not.toMatch(INGLES);
  });
});
