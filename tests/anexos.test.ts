import { beforeEach, describe, expect, it } from "vitest";
import { PDF, PNG, TEXTO } from "./helpers/arquivos.js";
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
import { bruto, como } from "./helpers/http.js";
import { arquivos, limparStorage } from "./helpers/storage.js";

let condId: string;
let tipo: { id: string };
let sindicoId: string;
let zeladorId: string;
let prestadorId: string;
let outroPrestadorId: string;

const subir = (clerk: string, url: string, conteudo: Buffer, nome: string, campo = "arquivo") =>
  bruto(clerk, "post", url).attach(campo, conteudo, nome);
const concluir = (clerk: string, ordemId: string, comprovantes: [Buffer, string][] = []) => {
  const r = bruto(clerk, "patch", `/ordens/${ordemId}/concluir`);
  for (const [b, n] of comprovantes) r.attach("comprovantes", b, n);
  if (comprovantes.length === 0) r.field("vazio", "1"); // multipart sem arquivo
  return r;
};

async function emExecucao(exigeNotaFiscal = false) {
  const o = await criarOrdem({
    condominioId: condId,
    criadoPorId: sindicoId,
    perfilCriador: "SINDICO",
    categoriaIds: [tipo.id],
    status: "EM_EXECUCAO",
    exigeNotaFiscal,
  });
  await criarProposta({ ordemId: o.id, prestadorId, status: "ACEITA" });
  await criarProposta({ ordemId: o.id, prestadorId: outroPrestadorId, status: "RECUSADA" });
  return o;
}

beforeEach(async () => {
  await limparBanco();
  limparStorage();
  condId = (await criarCondominio()).id;
  tipo = await criarCategoria({ nome: "Limpeza", zeladorPodeAbrir: true });
  sindicoId = (
    await criarPessoa({
      nome: "Carlos",
      clerk: "user_sind",
      vinculos: [{ condominioId: condId, perfil: "SINDICO" }],
    })
  ).id;
  zeladorId = (
    await criarPessoa({
      clerk: "user_zel",
      vinculos: [{ condominioId: condId, perfil: "ZELADOR" }],
    })
  ).id;
  await criarPessoa({ clerk: "user_fisc", vinculos: [{ condominioId: condId, perfil: "FISCAL" }] });
  prestadorId = (
    await criarPrestador({
      clerk: "user_prest",
      razaoSocial: "Eletro Silva",
      categoriaIds: [tipo.id],
    })
  ).id;
  outroPrestadorId = (await criarPrestador({ clerk: "user_outro", categoriaIds: [tipo.id] })).id;
});

describe("fotos e formulário (quem abriu)", () => {
  async function aberta(criadoPorId = sindicoId, perfil: "SINDICO" | "ZELADOR" = "SINDICO") {
    return criarOrdem({
      condominioId: condId,
      criadoPorId,
      perfilCriador: perfil,
      categoriaIds: [tipo.id],
    });
  }

  it("foto: grava, sobe para ordens/{id}/abertura e volta como URL assinada", async () => {
    const o = await aberta();
    const res = await subir("user_sind", `/ordens/${o.id}/anexos`, PNG, "vazamento.png");
    expect(res.status).toBe(200);
    expect(res.body.fotos).toEqual([
      expect.stringMatching(
        new RegExp(`^https://storage\\.test/ordens/${o.id}/abertura/.+\\.png$`),
      ),
    ]);
    expect(arquivos.size).toBe(1);
  });

  it("só quem abriu; PDF não é foto; sem arquivo → 400; máximo de 6", async () => {
    const o = await aberta();
    expect((await subir("user_fisc", `/ordens/${o.id}/anexos`, PNG, "a.png")).status).toBe(403);
    expect(
      (await subir("user_sind", `/ordens/${o.id}/anexos`, PDF, "a.pdf")).body.erro.codigo,
    ).toBe("TIPO_DE_ARQUIVO_INVALIDO");
    const vazio = await bruto("user_sind", "post", `/ordens/${o.id}/anexos`).field("x", "1");
    expect(vazio.body.erro.codigo).toBe("ARQUIVO_OBRIGATORIO");
    for (let i = 0; i < 6; i++) await subir("user_sind", `/ordens/${o.id}/anexos`, PNG, `${i}.png`);
    expect(
      (await subir("user_sind", `/ordens/${o.id}/anexos`, PNG, "7.png")).body.erro.codigo,
    ).toBe("LIMITE_DE_ARQUIVOS");
  });

  it("arquivo acima de 5 MB → 413", async () => {
    const o = await aberta();
    const grande = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await subir("user_sind", `/ordens/${o.id}/anexos`, grande, "grande.png");
    expect(res.status).toBe(413);
    expect(res.body.erro.codigo).toBe("ARQUIVO_GRANDE");
  });

  it("formulário: PDF aceito antes de qualquer proposta; depois → 409; zelador não anexa", async () => {
    const o = await aberta();
    const res = await subir("user_sind", `/ordens/${o.id}/formularios`, PDF, "orçamento.pdf");
    expect(res.status).toBe(200);
    expect(res.body.formularios).toEqual([
      expect.objectContaining({ nome: "orçamento.pdf", tipo: "FORMULARIO", enviadoPor: "Carlos" }),
    ]);
    expect((await subir("user_sind", `/ordens/${o.id}/formularios`, TEXTO, "x.pdf")).status).toBe(
      415,
    );
    await criarProposta({ ordemId: o.id, prestadorId });
    expect(
      (await subir("user_sind", `/ordens/${o.id}/formularios`, PDF, "b.pdf")).body.erro.codigo,
    ).toBe("FORMULARIO_BLOQUEADO");
    const doZelador = await aberta(zeladorId, "ZELADOR");
    expect(
      (await subir("user_zel", `/ordens/${doZelador.id}/formularios`, PDF, "z.pdf")).status,
    ).toBe(403);
  });
});

describe("nota fiscal e comprovação (prestador aprovado)", () => {
  it("prestador aprovado anexa a NF: evento e visível no detalhe dele", async () => {
    const o = await emExecucao(true);
    const res = await subir("user_prest", `/ordens/${o.id}/notas-fiscais`, PDF, "nf-123.pdf");
    expect(res.status).toBe(200);
    expect(res.body.notasFiscais).toEqual([
      expect.objectContaining({ nome: "nf-123.pdf", enviadoPor: "Eletro Silva" }),
    ]);
    expect(res.body.eventos.at(-1)).toMatchObject({
      tipo: "NOTA_FISCAL_ENVIADA",
      texto: 'Eletro Silva anexou a nota fiscal "nf-123.pdf"',
    });
  });

  it("prestador recusado não anexa; comprovação gera evento", async () => {
    const o = await emExecucao();
    expect((await subir("user_outro", `/ordens/${o.id}/notas-fiscais`, PDF, "nf.pdf")).status).toBe(
      403,
    );
    const res = await subir("user_prest", `/ordens/${o.id}/comprovacoes`, PNG, "pronto.png");
    expect(res.body.comprovacoes).toHaveLength(1);
    expect(res.body.eventos.at(-1).tipo).toBe("COMPROVACAO_ENVIADA");
  });
});

describe("concluir", () => {
  it("exige a NF quando a ordem pede e o comprovante de pagamento", async () => {
    const o = await emExecucao(true);
    const semNf = await concluir("user_sind", o.id, [[PDF, "pix.pdf"]]);
    expect(semNf.status).toBe(409);
    expect(semNf.body.erro.codigo).toBe("NOTA_FISCAL_PENDENTE");
    expect(arquivos.size).toBe(0); // nada subiu

    await subir("user_prest", `/ordens/${o.id}/notas-fiscais`, PDF, "nf.pdf");
    expect((await concluir("user_sind", o.id)).body.erro.codigo).toBe("PAGAMENTO_PENDENTE");

    const res = await concluir("user_sind", o.id, [[PDF, "pix.pdf"]]);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONCLUIDO");
    expect(res.body.comprovantesPagamento).toEqual([
      expect.objectContaining({ nome: "pix.pdf", tipo: "PAGAMENTO" }),
    ]);
    expect(res.body.eventos.at(-1)).toMatchObject({
      tipo: "CONCLUIDO",
      texto: "Serviço concluído por Carlos, com comprovante de pagamento",
      marco: true,
    });
  });

  it("o prestador vê o comprovante de pagamento; fiscal não conclui", async () => {
    const o = await emExecucao();
    expect((await concluir("user_fisc", o.id, [[PNG, "pix.png"]])).status).toBe(403);
    await concluir("user_sind", o.id, [[PNG, "pix.png"]]);
    const visto = await como("user_prest").get(`/ordens/${o.id}`);
    expect(visto.body.comprovantesPagamento).toHaveLength(1);
    expect(visto.body.status).toBe("CONCLUIDO");
    const gravada = await prisma.ordem.findUnique({ where: { id: o.id } });
    expect(gravada?.concluidoPorId).toBe(sindicoId);
  });

  it("não conclui fora da execução", async () => {
    const o = await criarOrdem({
      condominioId: condId,
      criadoPorId: sindicoId,
      categoriaIds: [tipo.id],
    });
    expect((await concluir("user_sind", o.id, [[PDF, "pix.pdf"]])).body.erro.codigo).toBe(
      "TRANSICAO_INVALIDA",
    );
  });
});
