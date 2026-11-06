// Dados mínimos para a API funcionar: categorias e o primeiro ADMIN. Idempotente (pode rodar de novo).
//   npm run seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categorias = [
  { slug: "eletrica", nome: "Elétrica", interna: false },
  { slug: "hidraulica", nome: "Hidráulica", interna: false },
  { slug: "limpeza", nome: "Limpeza", interna: false },
  { slug: "infraestrutura", nome: "Infraestrutura", interna: false },
  { slug: "ti", nome: "TI (uso interno)", interna: true },
];

async function main() {
  for (const c of categorias) {
    await prisma.categoria.upsert({ where: { slug: c.slug }, update: c, create: c });
  }
  console.log(`categorias: ${categorias.length}`);

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log("SEED_ADMIN_EMAIL vazio: nenhum ADMIN criado.");
    return;
  }
  // clerkUserId fica null: é preenchido no 1º login com este e-mail (verificado no Clerk).
  await prisma.usuario.upsert({
    where: { email },
    update: { perfil: "ADMIN", ativo: true },
    create: { email, nome: process.env.SEED_ADMIN_NOME || "Administradora", perfil: "ADMIN" },
  });
  console.log(`admin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
