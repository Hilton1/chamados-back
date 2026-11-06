// Seed de DEMONSTRAÇÃO: os mesmos dados do modo mock do front (front/lib/mocks/store.ts e
// front/docs/fluxo.md §4). Só roda em banco sem ordens de serviço (rode `npx prisma migrate reset` antes).
//   npm run seed:demo
//
// E-mails no formato `nome+clerk_test@example.com`: no Clerk em modo Development esses endereços
// aceitam o código de verificação 424242, então dá para criar as contas sem caixa de e-mail real.
// Datas são relativas a "agora" (como no mock), para os prazos fazerem sentido no dia da demo.
// Arquivos (formulário, NF, comprovantes) existem só como linha em `anexos`: o storagePath aponta
// para `demo/...`, que não existe no bucket. Fotos da abertura não são criadas.
import { Prisma, PrismaClient } from "@prisma/client";
import type {
  Perfil,
  StatusOrdem,
  StatusProposta,
  TipoAnexo,
  TipoEvento,
  Urgencia,
} from "@prisma/client";

const prisma = new PrismaClient();
const agora = Date.now();
const h = (horas: number) => new Date(agora + horas * 3_600_000);
const email = (nome: string) => `${nome}+clerk_test@example.com`;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ── Tipos de serviço ──
const tipos = [
  { slug: "eletrica", nome: "Elétrica" },
  { slug: "hidraulica", nome: "Hidráulica" },
  { slug: "limpeza", nome: "Limpeza", zeladorPodeAbrir: true },
  { slug: "infraestrutura", nome: "Infraestrutura" },
  { slug: "piscina", nome: "Piscina" },
  { slug: "jardinagem", nome: "Jardinagem", zeladorPodeAbrir: true },
  { slug: "ti", nome: "TI (uso interno)", interna: true },
  { slug: "dedetizacao", nome: "Dedetização", ativa: false },
] as const;

// ── Pessoas ──
type Vinc = { cond: "palmeiras" | "solar"; perfil: "SINDICO" | "FISCAL" | "ZELADOR" };
const pessoas: {
  chave: string;
  nome: string;
  email: string;
  telefone?: string;
  administradora?: boolean;
  ativo?: boolean;
  vinculos: Vinc[];
}[] = [
  {
    chave: "yasmin",
    nome: "Yasmin Almeida",
    email: email("yasmin"),
    telefone: "5582999000001",
    administradora: true,
    vinculos: [],
  },
  {
    chave: "carlos",
    nome: "Carlos Mendes",
    email: email("carlos"),
    telefone: "5582999000002",
    vinculos: [{ cond: "palmeiras", perfil: "SINDICO" }],
  },
  // Mesma pessoa com dois perfis: fiscal no Palmeiras e síndica no Solar do Farol.
  {
    chave: "marta",
    nome: "Marta Lima",
    email: email("marta"),
    telefone: "5582999000003",
    vinculos: [
      { cond: "palmeiras", perfil: "FISCAL" },
      { cond: "solar", perfil: "SINDICO" },
    ],
  },
  {
    chave: "antonio",
    nome: "Antônio Ferreira",
    email: email("antonio"),
    telefone: "5582999000004",
    vinculos: [{ cond: "palmeiras", perfil: "ZELADOR" }],
  },
  {
    chave: "joao",
    nome: "João Batista",
    email: email("joao"),
    telefone: "5582999000005",
    vinculos: [{ cond: "solar", perfil: "ZELADOR" }],
  },
  {
    chave: "rita",
    nome: "Rita Souza",
    email: email("rita"),
    ativo: false,
    vinculos: [{ cond: "palmeiras", perfil: "SINDICO" }],
  },
];

// ── Prestadores (f-1 = Raimundo, Eletro Silva) ──
const prestadores = [
  {
    chave: "f1",
    razaoSocial: "Eletro Silva Instalações",
    documento: "11222333000144",
    nome: "Raimundo Silva",
    email: email("raimundo"),
    tel: "5582999990001",
    nf: true,
    area: "Maceió e região metropolitana",
    tipos: ["eletrica", "infraestrutura"],
    status: "APROVADO",
    ativo: true,
  },
  {
    chave: "f2",
    razaoSocial: "Volt Serviços Elétricos",
    documento: "22333444000155",
    nome: "Paulo Volt",
    email: email("paulo.volt"),
    tel: "5582999990002",
    nf: true,
    area: "Maceió",
    tipos: ["eletrica", "limpeza"],
    status: "APROVADO",
    ativo: true,
    origem: "ADMINISTRADORA",
  },
  {
    chave: "f3",
    razaoSocial: "Hidro Master",
    documento: "33444555000166",
    nome: "Fernanda Lopes",
    email: email("fernanda"),
    tel: "5582999990003",
    nf: true,
    area: "Maceió",
    tipos: ["hidraulica", "piscina", "eletrica"],
    status: "APROVADO",
    ativo: true,
  },
  {
    chave: "f4",
    razaoSocial: "Encanamentos Rápidos",
    documento: "12345678901",
    nome: "Jorge Rapidão",
    email: email("jorge"),
    tel: "5582999990004",
    nf: true,
    area: "Maceió",
    tipos: ["hidraulica", "infraestrutura", "limpeza"],
    status: "APROVADO",
    ativo: true,
  },
  {
    chave: "f5",
    razaoSocial: "Limpa Tudo Serviços",
    documento: "44555666000177",
    nome: "Sônia Prado",
    email: email("sonia"),
    tel: "5582999990005",
    nf: true,
    area: "Maceió",
    tipos: ["limpeza", "jardinagem"],
    status: "APROVADO",
    ativo: true,
    origem: "ADMINISTRADORA",
  },
  {
    chave: "f6",
    razaoSocial: "Piscinas Azul Ltda",
    documento: "55666777000188",
    nome: "Bruno Azevedo",
    email: email("bruno"),
    tel: "5582999990006",
    nf: true,
    area: "Maceió e Marechal Deodoro",
    tipos: ["piscina"],
    status: "PENDENTE",
    ativo: true,
  },
  {
    chave: "f7",
    razaoSocial: "Jardins & Cia",
    documento: "98765432100",
    nome: "Lúcia Flor",
    email: email("lucia"),
    tel: "5582999990007",
    nf: false,
    area: "Maceió",
    tipos: ["jardinagem"],
    status: "APROVADO",
    ativo: false,
    motivo: "Deixou de emitir nota fiscal.",
  },
] as const;

// ── Ordens de serviço ──
type P = [
  prestador: string,
  valor: number,
  dispHoras: number,
  tempoHoras: number,
  status?: StatusProposta,
  obs?: string,
  motivoRecusa?: string,
];
type Arq = { nome: string; mime?: string; kb?: number; por: string; horasAtras: number };
type Semente = {
  n: number;
  cond?: "palmeiras" | "solar";
  por?: string;
  titulo: string;
  descricao: string;
  local: string;
  tipos: string[];
  urgencia?: Urgencia;
  status: StatusOrdem;
  prazo: number; // horas a partir de agora
  criadaHa: number; // horas atrás
  nf?: boolean;
  propostas?: P[];
  formularios?: Arq[];
  notas?: Arq[];
  pagamentos?: Arq[];
  comprovacoes?: Arq[];
  avaliacao?: { nota: number; comentario: string };
};

const MIN = 1 / 60;
const ordens: Semente[] = [
  // Palmeiras (aprova: Carlos)
  {
    n: 1,
    titulo: "Cano estourado na garagem, vazando muita água",
    descricao:
      "Cano principal da garagem (subsolo 1) estourou e está vazando direto. O registro geral não pode ser fechado sem deixar todos os moradores sem água.",
    local: "Garagem — subsolo 1",
    tipos: ["hidraulica"],
    urgencia: "URGENTE",
    status: "ABERTO",
    prazo: 1.5,
    criadaHa: 0.5,
    nf: true,
    propostas: [
      ["f3", 1850, 1, 4, "ENVIADA", "Equipe disponível em 1 h, já com material."],
      ["f4", 1400, 3, 6],
    ],
  },
  {
    n: 2,
    titulo: "Quadro de disjuntores desarmando na torre B",
    descricao:
      "Disjuntor geral da torre B desarma sozinho várias vezes ao dia. Cheiro leve de queimado no quadro, e a parede atrás dele está com infiltração.",
    local: "Torre B — hall térreo",
    tipos: ["eletrica", "infraestrutura"],
    urgencia: "URGENTE",
    status: "AGUARDANDO_APROVACAO",
    prazo: -20,
    criadaHa: 26,
    nf: true,
    propostas: [
      ["f1", 2300, 2, 5, "TRANSFERIDA", "Inclui troca do disjuntor e laudo."],
      ["f2", 2100, 12, 8],
      ["f3", 2800, 4, 4],
    ],
  },
  {
    n: 3,
    por: "marta",
    titulo: "Lâmpadas queimadas no corredor do 5º andar",
    descricao:
      "Três lâmpadas do corredor do 5º andar queimadas. Não é urgente, pode ser trocado em até 48 h.",
    local: "5º andar — corredor",
    tipos: ["eletrica"],
    status: "ABERTO",
    prazo: 30,
    criadaHa: 18,
    propostas: [
      ["f1", 180, 24, 1],
      ["f2", 150, 36, 1],
    ],
  },
  {
    n: 4,
    titulo: "Pintura do muro frontal descascando",
    descricao:
      "Infiltração e descascamento em cerca de 12 m do muro frontal. Precisa de tratamento e pintura. Preencha a ficha de vistoria anexa.",
    local: "Fachada — muro frontal",
    tipos: ["infraestrutura"],
    status: "ABERTO",
    prazo: 40,
    criadaHa: 3,
    nf: true,
    formularios: [
      { nome: "vistoria-muro-frontal.docx", mime: DOCX, kb: 38, por: "yasmin", horasAtras: 3 },
    ],
  },
  {
    n: 5,
    por: "carlos",
    titulo: "Troca do quadro de luz do salão de festas",
    descricao:
      "Quadro do salão de festas com disjuntores antigos. Substituição completa, com identificação dos circuitos.",
    local: "Salão de festas",
    tipos: ["eletrica"],
    status: "EM_EXECUCAO",
    prazo: -60,
    criadaHa: 96,
    nf: true,
    comprovacoes: [
      { nome: "quadro-antes-depois.jpg", mime: "image/jpeg", kb: 812, por: "f1", horasAtras: 6 },
    ],
    propostas: [
      ["f1", 1650, -12, 8, "ACEITA"],
      ["f2", 1720, 6, 8, "RECUSADA"],
      ["f4", 1900, 24, 10, "RECUSADA"],
    ],
  },
  {
    n: 10,
    por: "carlos",
    titulo: "Interfone da portaria sem áudio",
    descricao:
      "O interfone da portaria parou de transmitir áudio para os apartamentos dos blocos A e B.",
    local: "Portaria",
    tipos: ["eletrica"],
    status: "ABERTO",
    prazo: 20,
    criadaHa: 28,
    nf: true,
    propostas: [
      ["f1", 890, 50, 3, "RECUSADA", undefined, "Só consegue começar daqui a dois dias."],
      ["f2", 960, 8, 3],
      ["f3", 1100, 12, 2],
    ],
  },
  {
    n: 11,
    por: "marta",
    titulo: "Vazamento na torneira da área da piscina",
    descricao: "A torneira do chuveirão da piscina não fecha direito e pinga o dia todo.",
    local: "Área de lazer — chuveirão",
    tipos: ["hidraulica"],
    status: "EM_EXECUCAO",
    prazo: -30,
    criadaHa: 60,
    nf: false,
    propostas: [
      ["f3", 240, -6, 1, "ACEITA"],
      ["f4", 220, 20, 2, "RECUSADA"],
      ["f1", 310, 10, 2, "RECUSADA"],
    ],
  },
  {
    n: 12,
    titulo: "Refletores da quadra apagados",
    descricao: "Os quatro refletores da quadra poliesportiva não acendem desde a última chuva.",
    local: "Quadra poliesportiva",
    tipos: ["eletrica"],
    status: "EM_EXECUCAO",
    prazo: -50,
    criadaHa: 80,
    nf: true,
    comprovacoes: [
      {
        nome: "refletores-funcionando.jpg",
        mime: "image/jpeg",
        kb: 640,
        por: "f1",
        horasAtras: 10,
      },
    ],
    notas: [{ nome: "nf-2041-eletro-silva.pdf", por: "f1", horasAtras: 8 }],
    propostas: [
      ["f1", 1280, -20, 6, "ACEITA"],
      ["f2", 1350, -10, 8, "RECUSADA"],
      ["f3", 1500, -15, 5, "RECUSADA"],
    ],
  },
  {
    n: 13,
    por: "carlos",
    titulo: "Troca das luminárias da escada do bloco A",
    descricao:
      "Luminárias antigas da escada do bloco A substituídas por LED com sensor de presença.",
    local: "Bloco A — escadas",
    tipos: ["eletrica"],
    status: "CONCLUIDO",
    prazo: -300,
    criadaHa: 340,
    nf: true,
    notas: [{ nome: "nf-1987-eletro-silva.pdf", por: "f1", horasAtras: 300 }],
    pagamentos: [{ nome: "pix-luminarias-bloco-a.pdf", por: "carlos", horasAtras: 298 }],
    avaliacao: {
      nota: 5,
      comentario: "Serviço limpo e no prazo. Deixou os circuitos identificados.",
    },
    propostas: [
      ["f1", 2200, -320, 10, "ACEITA"],
      ["f2", 2450, -310, 12, "RECUSADA"],
      ["f3", 2600, -315, 8, "RECUSADA"],
    ],
  },
  {
    n: 16,
    titulo: "Tomada do salão de jogos em curto",
    descricao:
      "Tomada perto da mesa de sinuca soltou faísca e escureceu. Desligamos o disjuntor do salão por segurança.",
    local: "Salão de jogos",
    tipos: ["eletrica"],
    urgencia: "URGENTE",
    status: "ABERTO",
    prazo: 3,
    criadaHa: 1,
    nf: true,
    propostas: [
      ["f1", 320, 2, 1, "CANCELADA"],
      ["f2", 290, 4, 1],
    ],
  },
  {
    n: 15,
    por: "marta",
    titulo: "Reparo do piso da calçada interna",
    descricao:
      "Placas soltas na calçada entre os blocos. Cancelado: a construtora vai refazer na garantia.",
    local: "Calçada entre os blocos",
    tipos: ["infraestrutura"],
    status: "CANCELADO",
    prazo: -120,
    criadaHa: 160,
    propostas: [
      ["f1", 2100, -100, 16],
      ["f4", 1900, -90, 20],
    ],
  },
  // Do zelador (Antônio): só Limpeza e Jardinagem.
  {
    n: 8,
    por: "antonio",
    titulo: "Limpeza pós-obra do salão de festas",
    descricao: "Limpeza pesada do salão de festas após a reforma do piso.",
    local: "Salão de festas",
    tipos: ["limpeza"],
    status: "ABERTO",
    prazo: 20,
    criadaHa: 4,
    propostas: [
      ["f5", 650, 10, 8],
      ["f2", 720, 6, 8],
      ["f4", 900, 24, 10],
    ],
  },
  {
    n: 17,
    por: "antonio",
    titulo: "Poda das árvores do estacionamento",
    descricao: "Galhos das amendoeiras do estacionamento descoberto encostando nos carros.",
    local: "Estacionamento descoberto",
    tipos: ["jardinagem"],
    status: "ABERTO",
    prazo: 44,
    criadaHa: 30 * MIN,
  },
  {
    n: 18,
    por: "antonio",
    titulo: "Lavagem da garagem do subsolo",
    descricao: "Lavagem completa do piso da garagem, com remoção de manchas de óleo.",
    local: "Garagem — subsolo 1 e 2",
    tipos: ["limpeza"],
    status: "AGUARDANDO_APROVACAO",
    prazo: -5,
    criadaHa: 50,
    propostas: [
      ["f5", 980, 30, 10, "TRANSFERIDA", "Com lavadora de alta pressão."],
      ["f4", 1050, 24, 12],
      ["f2", 1200, 40, 10],
    ],
  },
  {
    n: 19,
    por: "antonio",
    titulo: "Replantio do canteiro da entrada",
    descricao: "Troca das plantas secas do canteiro da entrada social e adubação.",
    local: "Entrada social",
    tipos: ["jardinagem"],
    status: "EM_EXECUCAO",
    prazo: -40,
    criadaHa: 75,
    propostas: [["f5", 560, -8, 6, "ACEITA"]],
  },
  {
    n: 14,
    por: "antonio",
    titulo: "Limpeza das caixas de gordura",
    descricao: "Limpeza semestral das caixas de gordura dos blocos A e B.",
    local: "Blocos A e B — térreo",
    tipos: ["limpeza"],
    status: "CONCLUIDO",
    prazo: -200,
    criadaHa: 230,
    pagamentos: [{ nome: "recibo-limpa-tudo.pdf", por: "carlos", horasAtras: 190 }],
    propostas: [
      ["f5", 480, -210, 6, "ACEITA"],
      ["f4", 520, -205, 8, "RECUSADA"],
    ],
  },
  {
    n: 20,
    por: "antonio",
    titulo: "Limpeza dos vidros da fachada",
    descricao:
      "Limpeza externa dos vidros do hall. Cancelada: entrou no contrato mensal de limpeza.",
    local: "Hall de entrada",
    tipos: ["limpeza"],
    status: "CANCELADO",
    prazo: -150,
    criadaHa: 170,
  },

  // Solar do Farol (a administradora aprova)
  {
    n: 9,
    cond: "solar",
    por: "marta",
    titulo: "Bomba da piscina fazendo barulho e perdendo pressão",
    descricao:
      "A bomba do filtro da piscina está fazendo barulho alto e a água não circula direito. Pode ser rolamento ou o motor.",
    local: "Área de lazer — casa de máquinas da piscina",
    tipos: ["piscina", "eletrica"],
    status: "ABERTO",
    prazo: 26,
    criadaHa: 22,
    nf: true,
    propostas: [
      ["f3", 980, 20, 4, "ENVIADA", "Troca do rolamento; se for o motor, orço à parte."],
      ["f1", 1150, 30, 5],
      ["f2", 1090, 18, 6],
    ],
  },
  {
    n: 23,
    cond: "solar",
    titulo: "Rachadura na parede da garagem",
    descricao:
      "Rachadura diagonal de cerca de 1,5 m na parede da garagem, perto da vaga 12. Precisa de avaliação antes do reparo.",
    local: "Garagem — vaga 12",
    tipos: ["infraestrutura"],
    urgencia: "URGENTE",
    status: "ABERTO",
    prazo: 5,
    criadaHa: 2,
    nf: true,
  },
  {
    n: 24,
    cond: "solar",
    titulo: "Câmeras da portaria fora do ar",
    descricao: "O gravador das câmeras parou de gravar. Verificar HD e acesso remoto.",
    local: "Portaria",
    tipos: ["ti"],
    status: "ABERTO",
    prazo: 40,
    criadaHa: 6,
  },
  {
    n: 21,
    cond: "solar",
    por: "marta",
    titulo: "Registro da cozinha do salão vazando",
    descricao: "O registro da pia da cozinha do salão de festas vaza quando aberto.",
    local: "Salão de festas — cozinha",
    tipos: ["hidraulica"],
    status: "EM_EXECUCAO",
    prazo: -20,
    criadaHa: 48,
    nf: true,
    propostas: [
      ["f4", 350, -4, 2, "ACEITA"],
      ["f3", 420, 10, 2, "RECUSADA"],
    ],
  },
  {
    n: 25,
    cond: "solar",
    por: "marta",
    titulo: "Pintura da guarita",
    descricao: "Pintura interna e externa da guarita, com tratamento das paredes úmidas.",
    local: "Guarita",
    tipos: ["infraestrutura"],
    status: "EM_EXECUCAO",
    prazo: -70,
    criadaHa: 100,
    nf: true,
    notas: [{ nome: "nf-312-encanamentos-rapidos.pdf", por: "f4", horasAtras: 12 }],
    comprovacoes: [
      { nome: "guarita-pintada.jpg", mime: "image/jpeg", kb: 720, por: "f4", horasAtras: 14 },
    ],
    propostas: [
      ["f4", 1400, -40, 16, "ACEITA"],
      ["f1", 1650, -30, 20, "RECUSADA"],
    ],
  },
  {
    n: 6,
    cond: "solar",
    titulo: "Troca do motor do portão da garagem",
    descricao: "Motor do portão automático parou de funcionar.",
    local: "Portaria — portão da garagem",
    tipos: ["eletrica"],
    status: "CONCLUIDO",
    prazo: -200,
    criadaHa: 240,
    nf: true,
    comprovacoes: [
      { nome: "motor-instalado.jpg", mime: "image/jpeg", kb: 640, por: "f1", horasAtras: 180 },
    ],
    notas: [{ nome: "nota-fiscal-1873.pdf", por: "f1", horasAtras: 178 }],
    pagamentos: [{ nome: "pix-eletro-silva.pdf", por: "yasmin", horasAtras: 170 }],
    propostas: [
      ["f1", 1900, -180, 6, "ACEITA"],
      ["f2", 2050, -170, 8, "RECUSADA"],
      ["f3", 2400, -160, 5, "RECUSADA"],
    ],
  },
  {
    n: 22,
    cond: "solar",
    por: "marta",
    titulo: "Tratamento da água da piscina",
    descricao: "Água verde depois do feriado. Choque de cloro e limpeza do filtro.",
    local: "Piscina",
    tipos: ["piscina"],
    status: "CONCLUIDO",
    prazo: -400,
    criadaHa: 420,
    nf: true,
    notas: [{ nome: "nf-hidro-master-552.pdf", por: "f3", horasAtras: 380 }],
    pagamentos: [{ nome: "boleto-pago-hidro-master.pdf", por: "yasmin", horasAtras: 370 }],
    avaliacao: {
      nota: 4,
      comentario: "Resolveu em um dia, mas precisou voltar para ajustar o pH.",
    },
    propostas: [["f3", 450, -400, 6, "ACEITA"]],
  },
  {
    n: 7,
    cond: "solar",
    titulo: "Vazamento na cobertura",
    descricao:
      "Infiltração em dois pontos da laje da cobertura. Cancelado: coberto pelo seguro do condomínio.",
    local: "Cobertura",
    tipos: ["infraestrutura"],
    status: "CANCELADO",
    prazo: -100,
    criadaHa: 150,
  },
];

async function main() {
  if ((await prisma.ordem.count()) > 0) {
    console.error(
      "O banco já tem ordens de serviço. Rode `npx prisma migrate reset` antes do seed de demonstração.",
    );
    process.exit(1);
  }

  await prisma.$transaction(
    async (tx) => {
      // Tipos de serviço
      const tipoId: Record<string, string> = {};
      for (const t of tipos) {
        const c = await tx.categoria.upsert({
          where: { slug: t.slug },
          update: {},
          create: { ...t },
        });
        tipoId[t.slug] = c.id;
      }

      // Pessoas
      const usuarioId: Record<string, string> = {};
      const nomeDe: Record<string, string> = {};
      for (const p of pessoas) {
        const u = await tx.usuario.create({
          data: {
            nome: p.nome,
            email: p.email,
            telefone: p.telefone,
            administradora: p.administradora ?? false,
            ativo: p.ativo ?? true,
          },
        });
        usuarioId[p.chave] = u.id;
        nomeDe[p.chave] = p.nome;
      }
      const admin = usuarioId.yasmin!;

      // Condomínios
      const palmeiras = await tx.condominio.create({
        data: {
          nome: "Residencial Jardim das Palmeiras",
          cnpj: "12345678000190",
          endereco: "Rua Jangadeiros Alagoanos, 1200",
          bairro: "Ponta Verde",
          cidade: "Maceió",
          uf: "AL",
          latitude: -9.6658,
          longitude: -35.7003,
          aprovadorId: usuarioId.carlos,
        },
      });
      // Síndica sem tempo para o sistema: a própria administradora aprova (aprovadorId = null).
      const solar = await tx.condominio.create({
        data: {
          nome: "Edifício Solar do Farol",
          cnpj: "98765432000110",
          endereco: "Av. Fernandes Lima, 850",
          bairro: "Farol",
          cidade: "Maceió",
          uf: "AL",
          latitude: -9.6498,
          longitude: -35.7343,
        },
      });
      await tx.condominio.create({
        data: {
          nome: "Condomínio Vila Atlântica",
          endereco: "Rua Desportista Humberto Guimarães, 300",
          bairro: "Pajuçara",
          cidade: "Maceió",
          uf: "AL",
          ativo: false,
        },
      });
      const cond = { palmeiras, solar };
      const perfilEm: Record<string, Partial<Record<string, Perfil>>> = {};
      for (const p of pessoas) {
        for (const v of p.vinculos) {
          await tx.vinculoCondominio.create({
            data: {
              usuarioId: usuarioId[p.chave]!,
              condominioId: cond[v.cond].id,
              perfil: v.perfil,
            },
          });
          (perfilEm[p.chave] ??= {})[v.cond] = v.perfil;
        }
      }

      // Prestadores (cada um com a sua conta em `usuarios`)
      const prestadorId: Record<string, string> = {};
      for (const f of prestadores) {
        const u = await tx.usuario.create({
          data: { nome: f.nome, email: f.email, telefone: f.tel },
        });
        const origem = "origem" in f ? f.origem : "AUTOCADASTRO";
        const p = await tx.prestador.create({
          data: {
            usuarioId: u.id,
            razaoSocial: f.razaoSocial,
            documento: f.documento,
            telefoneWhatsapp: f.tel,
            emiteNotaFiscal: f.nf,
            areaAtuacao: f.area,
            status: f.status,
            origem,
            ativo: f.ativo,
            motivoInativacao: "motivo" in f ? f.motivo : null,
            aprovadoPorId: f.status === "APROVADO" ? admin : null,
            aprovadoEm: f.status === "APROVADO" ? h(-24 * 90) : null,
            createdAt: f.chave === "f6" ? h(-20) : f.chave === "f4" ? h(-24 * 5) : h(-24 * 90),
            categorias: { create: f.tipos.map((t) => ({ categoriaId: tipoId[t]! })) },
          },
        });
        prestadorId[f.chave] = p.id;
        usuarioId[f.chave] = u.id;
        nomeDe[f.chave] = f.razaoSocial;
      }
      const razao = (chave: string) => nomeDe[chave]!;

      // Ordens de serviço
      for (const s of ordens) {
        const c = cond[s.cond ?? "palmeiras"];
        const autor = s.por ?? "yasmin";
        const perfilCriador: Perfil =
          autor === "yasmin" ? "ADMIN" : (perfilEm[autor]?.[s.cond ?? "palmeiras"] ?? "SINDICO");
        const aprovador = c.aprovadorId ? nomeDe.carlos! : "a administradora";
        const criadaEm = h(-s.criadaHa);
        const depois = (horasAtras: number) => h(-Math.max(horasAtras, 0.05));
        const props = s.propostas ?? [];
        const aceita = props.find((p) => p[4] === "ACEITA");
        const escolhida = props.find((p) => p[4] === "ACEITA" || p[4] === "TRANSFERIDA");
        const pagamento = s.pagamentos?.[0];

        const ordem = await tx.ordem.create({
          data: {
            numero: 100 + s.n,
            condominioId: c.id,
            criadoPorId: usuarioId[autor]!,
            perfilCriador,
            titulo: s.titulo,
            descricao: s.descricao,
            local: s.local,
            urgencia: s.urgencia ?? "NORMAL",
            status: s.status,
            prazoPropostasAte: h(s.prazo),
            exigeNotaFiscal: s.nf ?? false,
            createdAt: criadaEm,
            aprovadoPorId: aceita ? (c.aprovadorId ?? admin) : null,
            aprovadoEm: aceita ? depois(s.criadaHa - 8) : null,
            concluidoPorId:
              s.status === "CONCLUIDO" ? usuarioId[pagamento?.por ?? "yasmin"]! : null,
            concluidoEm: s.status === "CONCLUIDO" ? depois(s.criadaHa - 30) : null,
            canceladoPorId: s.status === "CANCELADO" ? admin : null,
            canceladoEm: s.status === "CANCELADO" ? depois(s.criadaHa - 4) : null,
            categorias: { create: s.tipos.map((t) => ({ categoriaId: tipoId[t]! })) },
          },
        });

        // Propostas
        for (const [
          i,
          [f, valor, disp, tempo, status = "ENVIADA", obs, motivoRecusa],
        ] of props.entries()) {
          const transferida = status === "TRANSFERIDA" || status === "ACEITA" || !!motivoRecusa;
          await tx.proposta.create({
            data: {
              ordemId: ordem.id,
              prestadorId: prestadorId[f]!,
              valor: new Prisma.Decimal(valor),
              disponivelEm: h(disp),
              tempoExecucaoHoras: tempo,
              observacao: obs,
              status,
              motivoRecusa,
              transferidaPorId: transferida && c.aprovadorId ? admin : null,
              transferidaEm: transferida && c.aprovadorId ? depois(s.criadaHa - 5) : null,
              createdAt: depois(s.criadaHa - 0.5 - i * 0.5),
            },
          });
        }

        // Anexos (só os registros; os arquivos não existem no bucket)
        const anexar = (tipo: TipoAnexo, arquivos: Arq[] = []) =>
          Promise.all(
            arquivos.map((a) =>
              tx.anexo.create({
                data: {
                  ordemId: ordem.id,
                  tipo,
                  enviadoPorId: usuarioId[a.por]!,
                  nomeOriginal: a.nome,
                  storagePath: `demo/ordens/${100 + s.n}/${tipo.toLowerCase()}/${a.nome}`,
                  mimeType: a.mime ?? "application/pdf",
                  tamanhoBytes: (a.kb ?? 180) * 1024,
                  createdAt: depois(a.horasAtras),
                },
              }),
            ),
          );
        await anexar("FORMULARIO", s.formularios);
        await anexar("COMPROVACAO", s.comprovacoes);
        await anexar("NOTA_FISCAL", s.notas);
        await anexar("PAGAMENTO", s.pagamentos);

        // Avaliação
        if (s.avaliacao && aceita) {
          await tx.avaliacao.create({
            data: {
              ordemId: ordem.id,
              prestadorId: prestadorId[aceita[0]]!,
              avaliadorId: c.aprovadorId ?? admin,
              nota: s.avaliacao.nota,
              comentario: s.avaliacao.comentario,
              createdAt: depois(s.criadaHa - 32),
            },
          });
        }

        // Linha do tempo (mesma lógica de front/lib/mocks/store.ts → historico())
        const ev: {
          tipo: TipoEvento;
          texto: string;
          horasAtras: number;
          marco?: boolean;
          autor?: string;
        }[] = [
          {
            tipo: "ABERTO",
            texto: `Aberta por ${nomeDe[autor]}`,
            horasAtras: s.criadaHa,
            marco: true,
            autor,
          },
        ];
        if (props.length > 0)
          ev.push({
            tipo: "PROPOSTA_RECEBIDA",
            texto: `Primeira proposta: ${razao(props[0]![0])}`,
            horasAtras: s.criadaHa - 1,
            autor: props[0]![0],
          });
        if (props.length >= 3)
          ev.push({
            tipo: "PROPOSTA_RECEBIDA",
            texto: "Terceira proposta recebida — mínimo atingido",
            horasAtras: s.criadaHa - 3,
            marco: true,
          });
        for (const p of props.filter((p) => p[6])) {
          ev.push({
            tipo: "TRANSFERIDA",
            texto: `Administradora transferiu para aprovação de ${aprovador} a proposta de ${razao(p[0])}`,
            horasAtras: s.criadaHa - 4,
            autor: "yasmin",
          });
          ev.push({
            tipo: "REPROVADA",
            texto: `${aprovador} reprovou a proposta de ${razao(p[0])}: “${p[6]}”`,
            horasAtras: s.criadaHa - 4.5,
            marco: true,
            autor: "carlos",
          });
        }
        for (const p of props.filter((p) => p[4] === "CANCELADA"))
          ev.push({
            tipo: "PROPOSTA_RECEBIDA",
            texto: `${razao(p[0])} cancelou a proposta`,
            horasAtras: s.criadaHa - 2,
            autor: p[0],
          });
        if (escolhida && c.aprovadorId)
          ev.push({
            tipo: "TRANSFERIDA",
            texto: `Administradora transferiu para aprovação de ${aprovador} a proposta de ${razao(escolhida[0])}`,
            horasAtras: s.criadaHa - 5,
            autor: "yasmin",
          });
        if (aceita)
          ev.push({
            tipo: "APROVADA",
            texto: `${c.aprovadorId ? nomeDe.carlos : "Administradora"} aprovou ${razao(aceita[0])}`,
            horasAtras: s.criadaHa - 8,
            marco: true,
            autor: c.aprovadorId ? "carlos" : "yasmin",
          });
        for (const a of s.comprovacoes ?? [])
          ev.push({
            tipo: "COMPROVACAO_ENVIADA",
            texto: `${nomeDe[a.por]} enviou "${a.nome}"`,
            horasAtras: a.horasAtras,
            autor: a.por,
          });
        for (const a of s.notas ?? [])
          ev.push({
            tipo: "NOTA_FISCAL_ENVIADA",
            texto: `${nomeDe[a.por]} anexou a nota fiscal "${a.nome}"`,
            horasAtras: a.horasAtras,
            autor: a.por,
          });
        if (s.status === "CONCLUIDO")
          ev.push({
            tipo: "CONCLUIDO",
            texto: "Serviço concluído, com comprovante de pagamento",
            horasAtras: s.criadaHa - 30,
            marco: true,
            autor: pagamento?.por,
          });
        if (s.avaliacao)
          ev.push({
            tipo: "AVALIADO",
            texto: `Prestador avaliado com nota ${s.avaliacao.nota}`,
            horasAtras: s.criadaHa - 32,
          });
        if (s.status === "CANCELADO")
          ev.push({
            tipo: "CANCELADO",
            texto: "Ordem de serviço cancelada",
            horasAtras: s.criadaHa - 4,
            marco: true,
            autor: "yasmin",
          });

        await tx.ordemEvento.createMany({
          data: ev.map((e) => ({
            ordemId: ordem.id,
            tipo: e.tipo,
            texto: e.texto,
            marco: e.marco ?? false,
            autorId: e.autor ? usuarioId[e.autor] : null,
            createdAt: depois(e.horasAtras),
          })),
        });
      }

      // Média e total de avaliações (desnormalizados), a partir das avaliações gravadas.
      const medias = await tx.avaliacao.groupBy({
        by: ["prestadorId"],
        _avg: { nota: true },
        _count: true,
      });
      for (const m of medias) {
        await tx.prestador.update({
          where: { id: m.prestadorId },
          data: {
            mediaAvaliacao: new Prisma.Decimal(m._avg.nota ?? 0).toDecimalPlaces(2),
            totalAvaliacoes: m._count,
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  // Os números #101–#125 foram gravados à mão: a próxima ordem continua depois do maior.
  await prisma.$executeRaw`SELECT setval('ordens_servico_numero_seq', (SELECT MAX(numero) FROM ordens_servico))`;

  const [o, p, u] = await Promise.all([
    prisma.ordem.count(),
    prisma.proposta.count(),
    prisma.usuario.count(),
  ]);
  console.log(
    `demo: ${o} ordens de serviço, ${p} propostas, ${u} contas. Senha/código no Clerk dev: 424242.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
