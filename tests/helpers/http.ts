import request from "supertest";
import { criarApp } from "../../src/app.js";

export const app = criarApp();

/** Requisições autenticadas como o usuário do Clerk `clerkId`, com o perfil ativo opcional. */
export function como(clerkId: string, perfil?: string) {
  const h = (r: request.Test) => {
    r.set("Authorization", `Bearer ${clerkId}`);
    if (perfil) r.set("X-Perfil", perfil);
    return r;
  };
  return {
    get: (url: string) => h(request(app).get(`/api${url}`)),
    post: (url: string, body?: object) => h(request(app).post(`/api${url}`)).send(body),
    patch: (url: string, body?: object) => h(request(app).patch(`/api${url}`)).send(body),
  };
}

export const anonimo = () => request(app);
