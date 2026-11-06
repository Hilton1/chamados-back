// Validações e normalizações compartilhadas pelos schemas Zod.
import { z } from "zod";

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
