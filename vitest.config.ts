import { defineConfig } from "vitest/config";

// Testes de rota rodam contra um Postgres de verdade (banco separado, `chamados_test`), para pegar
// regras de escopo/LGPD e constraints do banco. Local: o do docker compose. CI: serviço postgres.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://chamados:chamados@localhost:5432/chamados_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false, // um banco só: arquivos em sequência
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      FRONTEND_URL: "http://localhost:3000",
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
    },
  },
});
