// Aplica as migrations no banco de teste (cria o banco se não existir) uma vez por execução.
import { execSync } from "node:child_process";

export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://chamados:chamados@localhost:5432/chamados_test";
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
