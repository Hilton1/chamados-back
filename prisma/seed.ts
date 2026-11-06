// Dados mínimos para a API funcionar: tipos de serviço e a primeira pessoa da administradora.
// Idempotente (pode rodar de novo).   npm run seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tiposServico = [
  { slug: "eletrica", nome: "Elétrica", interna: false, zeladorPodeAbrir: false },
  { slug: "hidraulica", nome: "Hidráulica", interna: false, zeladorPodeAbrir: false },
  { slug: "limpeza", nome: "Limpeza", interna: false, zeladorPodeAbrir: true },
  { slug: "infraestrutura", nome: "Infraestrutura", interna: false, zeladorPodeAbrir: false },
  { slug: "piscina", nome: "Piscina", interna: false, zeladorPodeAbrir: false },
  { slug: "jardinagem", nome: "Jardinagem", interna: false, zeladorPodeAbrir: true },
  { slug: "ti", nome: "TI (uso interno)", interna: true, zeladorPodeAbrir: false },
];

async function main() {
  for (const t of tiposServico) {
    // Não sobrescreve o que a administradora já mudou na tela (só cria o que faltar).
    await prisma.categoria.upsert({ where: { slug: t.slug }, update: {}, create: t });
  }
  console.log(`tipos de serviço: ${tiposServico.length}`);

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log("SEED_ADMIN_EMAIL vazio: nenhuma pessoa da administradora criada.");
    return;
  }
  // clerkUserId fica null: é preenchido no 1º login com este e-mail (verificado no Clerk).
  await prisma.usuario.upsert({
    where: { email },
    update: { administradora: true, ativo: true },
    create: { email, nome: process.env.SEED_ADMIN_NOME || "Administradora", administradora: true },
  });
  console.log(`administradora: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
