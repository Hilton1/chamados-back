import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { arquivos, controle, limparStorage } from "./helpers/storage.js";

let condId: string;
let eletrica: { id: string };
let piscina: { id: string };
let admId: string;
let prestadorId: string;

const prest = () => como("user_prest");
const enviar = (ordemId: string, campos: Record<string, string> = {}) => {
  const r = bruto("user_prest", "post", `/ordens/${ordemId}/propostas`);
  const dados = {
    valor: "450.5",
    disponivelEm: new Date(Date.now() + 86_400_000).toISOString(),
    tempoExecucaoHoras: "4",
    ...campos,
  };
  for (const [k, v] of Object.entries(dados)) r.field(k, v);
  return r;
};

async function ordem(extra: Partial<Parameters<typeof criarOrdem>[0]> = {}) {
  return criarOrdem({
    condominioId: condId,
    criadoPorId: admId,
    categoriaIds: [eletrica.id],
    ...extra,
  });
}

beforeEach(async () => {
  await limparBanco();
  limparStorage();
  condId = (await criarCondominio({ nome: "Palmeiras" })).id;
  eletrica = await criarCategoria({ nome: "Elétrica" });
  piscina = await criarCategoria({ nome: "Piscina" });
  admId = (await criarPessoa({ administradora: true, clerk: "user_adm" })).id;
  prestadorId = (
    await criarPrestador({
      clerk: "user_prest",
      razaoSocial: "Eletro Silva",
      categoriaIds: [eletrica.id],
    })
  ).id;
});

describe("mural", () => {
  it("mostra ordens abertas, no prazo, de qualquer tipo que ele atende; urgentes primeiro", async () => {
    await ordem({ titulo: "Normal" });
    await ordem({ titulo: "Urgente", urgencia: "URGENTE" });
    await ordem({ titulo: "Mista", categoriaIds: [piscina.id, eletrica.id] });
    await ordem({ titulo: "Só piscina", categoriaIds: [piscina.id] });
    await ordem({ titulo: "Vencida", prazoHoras: -1 });
    await ordem({ titulo: "Em execução", status: "EM_EXECUCAO" });
    const res = await prest().get("/mural");
    expect(res.status).toBe(200);
    expect(res.body.map((o: { titulo: string }) => o.titulo)).toEqual([
      "Urgente",
      "Mista",
      "Normal",
    ]);
    expect(res.body[0]).toMatchObject({ local: "", condominio: { nome: "" }, eventos: [] });
  });

  it("prestador pendente ou desativado não vê nada", async () => {
    await ordem();
    await prisma.prestador.update({ where: { id: prestadorId }, data: { status: "PENDENTE" } });
    expect((await prest().get("/mural")).body).toEqual([]);
    await prisma.prestador.update({
      where: { id: prestadorId },
      data: { status: "APROVADO", ativo: false },
    });
    expect((await prest().get("/mural")).status).toBe(403);
  });

  it("só o prestador acessa", async () => {
    expect((await como("user_adm").get("/mural")).status).toBe(403);
  });
});

describe("enviar proposta (upsert)", () => {
  it("cria a proposta, registra o evento e aparece em minhaProposta e em /propostas/minhas", async () => {
    const o = await ordem();
    const res = await enviar(o.id, { observacao: "Levo o material" });
    expect(res.status).toBe(200);
    expect(res.body.minhaProposta).toMatchObject({
      status: "ENVIADA",
      valor: 450.5,
      tempoExecucaoHoras: 4,
      observacao: "Levo o material",
      prestador: { id: prestadorId, razaoSocial: "Eletro Silva" },
    });
    const eventos = await prisma.ordemEvento.findMany({ where: { ordemId: o.id } });
    expect(eventos.map((e) => e.texto)).toEqual(["Proposta recebida de Eletro Silva"]);
    const minhas = await prest().get("/propostas/minhas");
    expect(minhas.body).toHaveLength(1);
    expect(minhas.body[0].minhaProposta.valor).toBe(450.5);
  });

  it("enviar de novo edita a mesma proposta, sem novo evento", async () => {
    const o = await ordem();
    await enviar(o.id);
    const res = await enviar(o.id, { valor: "300" });
    expect(res.body.minhaProposta.valor).toBe(300);
    expect(await prisma.proposta.count({ where: { ordemId: o.id } })).toBe(1);
    expect(await prisma.ordemEvento.count({ where: { ordemId: o.id } })).toBe(1);
  });

  it("3ª proposta gera o marco de mínimo atingido", async () => {
    const o = await ordem();
    for (const _ of [1, 2]) {
      const p = await criarPrestador({ categoriaIds: [eletrica.id] });
      await criarProposta({ ordemId: o.id, prestadorId: p.id });
    }
    await enviar(o.id);
    const marco = await prisma.ordemEvento.findFirst({ where: { ordemId: o.id, marco: true } });
    expect(marco?.texto).toBe("Terceira proposta recebida — mínimo atingido");
  });

  it("valida campos (valor zero → 400)", async () => {
    const o = await ordem();
    const res = await enviar(o.id, { valor: "0" });
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe("VALIDACAO");
  });

  it("recusa depois do prazo, fora do ABERTO e para tipo que ele não atende", async () => {
    const vencida = await ordem({ prazoHoras: -1 });
    await criarProposta({ ordemId: vencida.id, prestadorId }); // continua visível pela proposta
    expect((await enviar(vencida.id)).body.erro.codigo).toBe("PRAZO_ENCERRADO");
    const fechada = await ordem({ status: "AGUARDANDO_APROVACAO" });
    await criarProposta({ ordemId: fechada.id, prestadorId });
    expect((await enviar(fechada.id)).body.erro.codigo).toBe("PROPOSTAS_ENCERRADAS");
    const outra = await ordem({ categoriaIds: [piscina.id] });
    expect((await enviar(outra.id)).status).toBe(404);
  });

  it("proposta reprovada não pode ser reenviada", async () => {
    const o = await ordem();
    await criarProposta({ ordemId: o.id, prestadorId, status: "RECUSADA" });
    expect((await enviar(o.id)).body.erro.codigo).toBe("PROPOSTA_BLOQUEADA");
  });

  it("prestador pendente não envia", async () => {
    const o = await ordem();
    await prisma.prestador.update({ where: { id: prestadorId }, data: { status: "PENDENTE" } });
    const res = await enviar(o.id);
    expect(res.status).toBe(403);
    expect(res.body.erro.codigo).toBe("PRESTADOR_NAO_APROVADO");
  });
});

describe("formulário obrigatório e arquivos da proposta", () => {
  async function ordemComFormulario() {
    const o = await ordem();
    await prisma.anexo.create({
      data: {
        ordemId: o.id,
        tipo: "FORMULARIO",
        enviadoPorId: admId,
        nomeOriginal: "orcamento.pdf",
        storagePath: `ordens/${o.id}/formulario/x.pdf`,
        mimeType: "application/pdf",
        tamanhoBytes: 100,
      },
    });
    return o;
  }

  it("sem o arquivo → 409 FORMULARIO_OBRIGATORIO; com o arquivo → grava e sobe ao storage", async () => {
    const o = await ordemComFormulario();
    const sem = await enviar(o.id);
    expect(sem.status).toBe(409);
    expect(sem.body.erro.codigo).toBe("FORMULARIO_OBRIGATORIO");

    const com = await enviar(o.id).attach("arquivos", PDF, "preenchido.pdf");
    expect(com.status).toBe(200);
    expect(com.body.minhaProposta.arquivos).toEqual([
      expect.objectContaining({
        nome: "preenchido.pdf",
        mime: "application/pdf",
        tipo: "PROPOSTA",
      }),
    ]);
    const propostaId = com.body.minhaProposta.id;
    expect([...arquivos.keys()]).toEqual([
      expect.stringMatching(new RegExp(`^ordens/${o.id}/proposta/${propostaId}/.+\\.pdf$`)),
    ]);
    // Editar depois: o arquivo já enviado conta.
    expect((await enviar(o.id, { valor: "100" })).status).toBe(200);
  });

  it("depois de cancelar, reenviar exige o arquivo de novo", async () => {
    const o = await ordemComFormulario();
    const r = await enviar(o.id).attach("arquivos", PNG, "foto.png");
    await prest().patch(`/propostas/${r.body.minhaProposta.id}/cancelar`);
    expect((await enviar(o.id)).body.erro.codigo).toBe("FORMULARIO_OBRIGATORIO");
  });

  it("tipo de arquivo é conferido pelo conteúdo", async () => {
    const o = await ordem();
    const res = await enviar(o.id).attach("arquivos", TEXTO, "falso.pdf");
    expect(res.status).toBe(415);
    expect(res.body.erro.codigo).toBe("TIPO_DE_ARQUIVO_INVALIDO");
  });

  it("se o banco falhar depois do upload, o arquivo é removido do storage", async () => {
    const o = await ordem();
    const espiao = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("banco caiu"));
    const res = await enviar(o.id).attach("arquivos", PNG, "a.png");
    espiao.mockRestore();
    expect(res.status).toBe(500);
    expect(arquivos.size).toBe(0);
  });

  it("falha do storage não grava nada", async () => {
    const o = await ordem();
    controle.falharUpload = true;
    const res = await enviar(o.id).attach("arquivos", PNG, "a.png");
    expect(res.status).toBe(500);
    expect(await prisma.proposta.count()).toBe(0);
  });
});

describe("cancelar proposta", () => {
  it("cancela a ENVIADA (evento) e pode reenviar", async () => {
    const o = await ordem();
    const r = await enviar(o.id);
    const res = await prest().patch(`/propostas/${r.body.minhaProposta.id}/cancelar`);
    expect(res.status).toBe(200);
    expect(res.body.minhaProposta.status).toBe("CANCELADA");
    const reenvio = await enviar(o.id);
    expect(reenvio.body.minhaProposta.status).toBe("ENVIADA");
    const textos = (
      await prisma.ordemEvento.findMany({ where: { ordemId: o.id }, orderBy: { createdAt: "asc" } })
    ).map((e) => e.texto);
    expect(textos).toEqual([
      "Proposta recebida de Eletro Silva",
      "Eletro Silva cancelou a proposta",
      "Eletro Silva reenviou a proposta",
    ]);
  });

  it("transferida não pode ser cancelada; proposta de outro → 404", async () => {
    const o = await ordem({ status: "AGUARDANDO_APROVACAO" });
    const p = await criarProposta({ ordemId: o.id, prestadorId, status: "TRANSFERIDA" });
    expect((await prest().patch(`/propostas/${p.id}/cancelar`)).body.erro.codigo).toBe(
      "PROPOSTA_BLOQUEADA",
    );
    const outro = await criarPrestador({ categoriaIds: [eletrica.id] });
    const alheia = await criarProposta({ ordemId: o.id, prestadorId: outro.id });
    expect((await prest().patch(`/propostas/${alheia.id}/cancelar`)).status).toBe(404);
  });
});
