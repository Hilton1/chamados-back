/** E-mails verificados no "Clerk" dos testes, por id de usuário do Clerk. */
const g = globalThis as { __emailsClerk?: Map<string, string> };
export const emailsClerk = (g.__emailsClerk ??= new Map<string, string>());
