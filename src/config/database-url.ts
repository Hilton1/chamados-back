// O pooler do Supabase em modo transação (porta 6543) reaproveita conexões entre clientes e não
// suporta prepared statements. Sem `pgbouncer=true` o Prisma passa a falhar com
// `prepared statement "sN" already exists`, o health check responde 503 e o Render derruba a
// instância. Aqui garantimos os parâmetros mesmo se a variável for cadastrada sem eles.
export function ajustarUrlPooler(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.port !== "6543") return url;
  if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
  if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
  return u.toString();
}
