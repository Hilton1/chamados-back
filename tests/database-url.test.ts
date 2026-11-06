import { describe, expect, it } from "vitest";
import { ajustarUrlPooler } from "../src/config/database-url.js";

describe("ajustarUrlPooler", () => {
  it("adiciona pgbouncer e connection_limit na porta 6543", () => {
    const u = new URL(ajustarUrlPooler("postgresql://u:p@h.pooler.supabase.com:6543/postgres"));
    expect(u.searchParams.get("pgbouncer")).toBe("true");
    expect(u.searchParams.get("connection_limit")).toBe("1");
  });

  it("preserva parâmetros já informados", () => {
    const u = new URL(ajustarUrlPooler("postgresql://u:p@h:6543/postgres?connection_limit=3"));
    expect(u.searchParams.get("connection_limit")).toBe("3");
    expect(u.searchParams.get("pgbouncer")).toBe("true");
  });

  it("não mexe em outras portas", () => {
    const url = "postgresql://u:p@localhost:5432/chamados";
    expect(ajustarUrlPooler(url)).toBe(url);
  });
});
