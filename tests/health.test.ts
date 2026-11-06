import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([1]) } }));

const { criarApp } = await import("../src/app.js");

describe("GET /api/health", () => {
  it("responde ok quando o banco responde", async () => {
    const res = await request(criarApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", banco: "ok" });
  });

  it("devolve o formato de erro padrão em rota inexistente", async () => {
    const res = await request(criarApp()).get("/api/nao-existe");
    expect(res.status).toBe(404);
    expect(res.body.erro.codigo).toBe("ROTA_NAO_ENCONTRADA");
  });
});
