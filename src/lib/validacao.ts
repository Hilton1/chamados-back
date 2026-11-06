// Validações e normalizações compartilhadas pelos schemas Zod.
import { z } from "zod";

// ───────────── Mensagens padrão do Zod em português ─────────────
// Valem para todo schema sem mensagem própria (a mensagem do schema tem prioridade). São frases
// sem o nome do campo: o nome vai em `campos[].campo` e na `mensagem` geral (ver middlewares/erro.ts).

const TIPO_ESPERADO: Record<string, string> = {
  string: "Precisa ser um texto.",
  number: "Precisa ser um número.",
  int: "Precisa ser um número inteiro.",
  boolean: "Precisa ser sim ou não (true/false).",
  array: "Precisa ser uma lista.",
  date: "Informe uma data válida.",
  object: "Formato inválido.",
};

const plural = (n: number | bigint, um: string, varios: string) =>
  `${n} ${Number(n) === 1 ? um : varios}`;

z.config({
  customError: (iss) => {
    switch (iss.code) {
      case "invalid_type":
        if (iss.input === undefined || iss.input === null) {
          // Corpo ausente/não-objeto na raiz.
          if (!iss.path?.length && iss.expected === "object")
            return "Envie os dados da requisição em JSON.";
          if (iss.expected !== "date") return "Campo obrigatório.";
        }
        return TIPO_ESPERADO[iss.expected] ?? "Valor inválido.";
      case "too_small":
        if (iss.origin === "string")
          return iss.input === "" || Number(iss.minimum) <= 1
            ? "Campo obrigatório."
            : `Use pelo menos ${plural(iss.minimum, "caractere", "caracteres")}.`;
        if (iss.origin === "array" || iss.origin === "set")
          return `Escolha pelo menos ${plural(iss.minimum, "item", "itens")}.`;
        if (iss.origin === "date") return "Data anterior ao permitido.";
        return iss.inclusive
          ? `Precisa ser no mínimo ${iss.minimum}.`
          : `Precisa ser maior que ${iss.minimum}.`;
      case "too_big":
        if (iss.origin === "string")
          return `Use no máximo ${plural(iss.maximum, "caractere", "caracteres")}.`;
        if (iss.origin === "array" || iss.origin === "set")
          return `Escolha no máximo ${plural(iss.maximum, "item", "itens")}.`;
        if (iss.origin === "date") return "Data posterior ao permitido.";
        return iss.inclusive
          ? `Precisa ser no máximo ${iss.maximum}.`
          : `Precisa ser menor que ${iss.maximum}.`;
      case "invalid_format":
        if (iss.format === "uuid" || iss.format === "guid") return "Identificador inválido.";
        if (iss.format === "email") return "E-mail inválido.";
        if (iss.format === "datetime" || iss.format === "date") return "Informe uma data válida.";
        return "Formato inválido.";
      case "invalid_value":
        return "Opção inválida.";
      case "not_multiple_of":
        return "Valor inválido.";
      case "unrecognized_keys":
        return "Há campos não reconhecidos.";
      default:
        return "Valor inválido.";
    }
  },
});

/** Nome legível de cada campo dos schemas (para a `mensagem` geral do erro de validação). */
export const ROTULO_CAMPO: Record<string, string> = {
  id: "Identificador",
  nome: "Nome",
  email: "E-mail",
  telefone: "Telefone",
  administradora: "Administradora",
  vinculos: "Vínculos",
  condominioId: "Condomínio",
  perfil: "Perfil",
  ativo: "Ativo",
  ativa: "Ativa",
  interna: "Uso interno",
  zeladorPodeAbrir: "Zelador pode abrir",
  razaoSocial: "Razão social",
  nomeContato: "Nome do contato",
  telefoneWhatsapp: "WhatsApp",
  emiteNotaFiscal: "Emite nota fiscal",
  areaAtuacao: "Área de atuação",
  categoriaIds: "Tipos de serviço",
  categoriaId: "Tipo de serviço",
  documento: "CPF/CNPJ",
  cnpj: "CNPJ",
  endereco: "Endereço",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  latitude: "Latitude",
  longitude: "Longitude",
  aprovadorId: "Quem aprova",
  titulo: "Título",
  descricao: "Descrição",
  local: "Local",
  urgencia: "Urgência",
  prazoUrgenteHoras: "Prazo de propostas",
  exigeNotaFiscal: "Exige nota fiscal",
  status: "Situação",
  situacao: "Situação",
  busca: "Busca",
  propostaId: "Proposta",
  motivo: "Motivo",
  nota: "Nota",
  comentario: "Comentário",
  valor: "Valor",
  disponivelEm: "Disponibilidade",
  tempoExecucaoHoras: "Tempo de execução",
  observacao: "Observação",
};

/** Rótulo do campo de um caminho do Zod (`vinculos.0.condominioId` → "Condomínio"). */
export function rotuloCampo(path: readonly PropertyKey[]): string | undefined {
  const chaves = path.filter((p): p is string => typeof p === "string");
  const ultima = chaves.at(-1);
  if (!ultima) return undefined;
  return ROTULO_CAMPO[ultima] ?? ultima;
}

const soDigitos = (v: string) => v.replace(/\D/g, "");

function cpfValido(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

function cnpjValido(cnpj: string) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (n: number) => {
    const pesos =
      n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(cnpj[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

/** CPF (11) ou CNPJ (14) com dígitos verificadores corretos. Aceita com máscara; devolve só dígitos. */
export const documento = z
  .string()
  .transform(soDigitos)
  .refine((d) => (d.length === 11 ? cpfValido(d) : cnpjValido(d)), "CPF ou CNPJ inválido.");

/** Só confere tamanho (documentos já gravados, ex.: dados de demonstração). */
export const documentoFormato = z
  .string()
  .transform(soDigitos)
  .refine((d) => d.length === 11 || d.length === 14, "CPF ou CNPJ inválido.");

/** CNPJ de condomínio: 14 dígitos (com ou sem máscara). */
export const cnpj = z
  .string()
  .transform(soDigitos)
  .refine((d) => d.length === 14, "CNPJ precisa ter 14 dígitos.");

/**
 * Celular brasileiro em E.164. Aceita "+55 (82) 99999-0001", "5582999990001" ou "82999990001";
 * grava só dígitos com o 55 na frente (ex.: 5582999990001), como no front.
 */
export const telefone = z
  .string()
  .transform((v) => soDigitos(v).replace(/^55(?=\d{10,11}$)/, ""))
  .refine((d) => d.length === 10 || d.length === 11, "Informe um celular com DDD.")
  .transform((d) => `55${d}`);

export const email = z.string().trim().toLowerCase().pipe(z.email("E-mail inválido."));

export const texto = (min = 2, max = 200) => z.string().trim().min(min).max(max);

export const uuid = z.uuid("Identificador inválido.");

export const idParam = z.object({ id: uuid });
