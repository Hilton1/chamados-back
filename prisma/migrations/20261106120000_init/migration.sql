-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'SINDICO', 'FISCAL', 'ZELADOR', 'PRESTADOR');

-- CreateEnum
CREATE TYPE "PerfilCondominio" AS ENUM ('SINDICO', 'FISCAL', 'ZELADOR');

-- CreateEnum
CREATE TYPE "StatusPrestador" AS ENUM ('PENDENTE', 'APROVADO');

-- CreateEnum
CREATE TYPE "OrigemPrestador" AS ENUM ('AUTOCADASTRO', 'ADMINISTRADORA');

-- CreateEnum
CREATE TYPE "Urgencia" AS ENUM ('NORMAL', 'URGENTE');

-- CreateEnum
CREATE TYPE "StatusOrdem" AS ENUM ('ABERTO', 'AGUARDANDO_APROVACAO', 'EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAnexo" AS ENUM ('ABERTURA', 'FORMULARIO', 'PROPOSTA', 'COMPROVACAO', 'NOTA_FISCAL', 'PAGAMENTO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('ABERTO', 'PROPOSTA_RECEBIDA', 'TRANSFERIDA', 'APROVADA', 'REPROVADA', 'COMPROVACAO_ENVIADA', 'NOTA_FISCAL_ENVIADA', 'CONCLUIDO', 'CANCELADO', 'AVALIADO');

-- CreateEnum
CREATE TYPE "StatusProposta" AS ENUM ('ENVIADA', 'TRANSFERIDA', 'ACEITA', 'RECUSADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "condominios" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "endereco" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "aprovador_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condominios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "clerk_user_id" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "administradora" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculos_condominio" (
    "usuario_id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "perfil" "PerfilCondominio" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculos_condominio_pkey" PRIMARY KEY ("usuario_id","condominio_id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "zelador_pode_abrir" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestadores" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "razao_social" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "telefone_whatsapp" TEXT NOT NULL,
    "emite_nota_fiscal" BOOLEAN NOT NULL,
    "area_atuacao" TEXT NOT NULL,
    "status" "StatusPrestador" NOT NULL DEFAULT 'PENDENTE',
    "origem" "OrigemPrestador" NOT NULL DEFAULT 'AUTOCADASTRO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "motivo_inativacao" TEXT,
    "aprovado_por_id" UUID,
    "aprovado_em" TIMESTAMP(3),
    "media_avaliacao" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_avaliacoes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prestadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestador_categorias" (
    "prestador_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,

    CONSTRAINT "prestador_categorias_pkey" PRIMARY KEY ("prestador_id","categoria_id")
);

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "condominio_id" UUID NOT NULL,
    "criado_por_id" UUID NOT NULL,
    "perfil_criador" "Perfil" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "urgencia" "Urgencia" NOT NULL DEFAULT 'NORMAL',
    "status" "StatusOrdem" NOT NULL DEFAULT 'ABERTO',
    "prazo_propostas_ate" TIMESTAMP(3) NOT NULL,
    "exige_nota_fiscal" BOOLEAN NOT NULL DEFAULT false,
    "aprovado_por_id" UUID,
    "aprovado_em" TIMESTAMP(3),
    "concluido_por_id" UUID,
    "concluido_em" TIMESTAMP(3),
    "cancelado_por_id" UUID,
    "cancelado_em" TIMESTAMP(3),
    "motivo_cancelamento" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordem_categorias" (
    "ordem_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,

    CONSTRAINT "ordem_categorias_pkey" PRIMARY KEY ("ordem_id","categoria_id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" UUID NOT NULL,
    "ordem_id" UUID NOT NULL,
    "proposta_id" UUID,
    "tipo" "TipoAnexo" NOT NULL,
    "enviado_por_id" UUID NOT NULL,
    "nome_original" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordem_eventos" (
    "id" UUID NOT NULL,
    "ordem_id" UUID NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "autor_id" UUID,
    "texto" TEXT NOT NULL,
    "marco" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordem_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propostas" (
    "id" UUID NOT NULL,
    "ordem_id" UUID NOT NULL,
    "prestador_id" UUID NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "disponivel_em" TIMESTAMP(3) NOT NULL,
    "tempo_execucao_horas" INTEGER NOT NULL,
    "observacao" TEXT,
    "status" "StatusProposta" NOT NULL DEFAULT 'ENVIADA',
    "motivo_recusa" TEXT,
    "transferida_por_id" UUID,
    "transferida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" UUID NOT NULL,
    "ordem_id" UUID NOT NULL,
    "prestador_id" UUID NOT NULL,
    "avaliador_id" UUID NOT NULL,
    "nota" SMALLINT NOT NULL,
    "comentario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "condominios_cnpj_key" ON "condominios"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_clerk_user_id_key" ON "usuarios"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "vinculos_condominio_condominio_id_idx" ON "vinculos_condominio"("condominio_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "categorias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "prestadores_usuario_id_key" ON "prestadores"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "prestadores_documento_key" ON "prestadores"("documento");

-- CreateIndex
CREATE INDEX "prestadores_status_ativo_idx" ON "prestadores"("status", "ativo");

-- CreateIndex
CREATE INDEX "prestador_categorias_categoria_id_idx" ON "prestador_categorias"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_numero_key" ON "ordens_servico"("numero");

-- CreateIndex
CREATE INDEX "ordens_servico_condominio_id_status_idx" ON "ordens_servico"("condominio_id", "status");

-- CreateIndex
CREATE INDEX "ordens_servico_criado_por_id_idx" ON "ordens_servico"("criado_por_id");

-- CreateIndex
CREATE INDEX "ordens_servico_status_urgencia_prazo_propostas_ate_idx" ON "ordens_servico"("status", "urgencia", "prazo_propostas_ate");

-- CreateIndex
CREATE INDEX "ordem_categorias_categoria_id_idx" ON "ordem_categorias"("categoria_id");

-- CreateIndex
CREATE INDEX "anexos_ordem_id_tipo_idx" ON "anexos"("ordem_id", "tipo");

-- CreateIndex
CREATE INDEX "anexos_proposta_id_idx" ON "anexos"("proposta_id");

-- CreateIndex
CREATE INDEX "ordem_eventos_ordem_id_created_at_idx" ON "ordem_eventos"("ordem_id", "created_at");

-- CreateIndex
CREATE INDEX "propostas_prestador_id_status_idx" ON "propostas"("prestador_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "propostas_ordem_id_prestador_id_key" ON "propostas"("ordem_id", "prestador_id");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_ordem_id_key" ON "avaliacoes"("ordem_id");

-- CreateIndex
CREATE INDEX "avaliacoes_prestador_id_idx" ON "avaliacoes"("prestador_id");

-- AddForeignKey
ALTER TABLE "condominios" ADD CONSTRAINT "condominios_aprovador_id_fkey" FOREIGN KEY ("aprovador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_condominio" ADD CONSTRAINT "vinculos_condominio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_condominio" ADD CONSTRAINT "vinculos_condominio_condominio_id_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestadores" ADD CONSTRAINT "prestadores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestadores" ADD CONSTRAINT "prestadores_aprovado_por_id_fkey" FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestador_categorias" ADD CONSTRAINT "prestador_categorias_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "prestadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestador_categorias" ADD CONSTRAINT "prestador_categorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_condominio_id_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_aprovado_por_id_fkey" FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_concluido_por_id_fkey" FOREIGN KEY ("concluido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_categorias" ADD CONSTRAINT "ordem_categorias_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_categorias" ADD CONSTRAINT "ordem_categorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_proposta_id_fkey" FOREIGN KEY ("proposta_id") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_eventos" ADD CONSTRAINT "ordem_eventos_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_eventos" ADD CONSTRAINT "ordem_eventos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "prestadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_transferida_por_id_fkey" FOREIGN KEY ("transferida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordens_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "prestadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────── Regras que o Prisma não expressa ─────────

-- protocolo legível começa em #101
ALTER SEQUENCE "ordens_servico_numero_seq" RESTART WITH 101;

ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_nota_chk" CHECK ("nota" BETWEEN 1 AND 5);
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_valor_chk" CHECK ("valor" > 0);
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_tempo_execucao_chk" CHECK ("tempo_execucao_horas" > 0);
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_tamanho_chk" CHECK ("tamanho_bytes" > 0 AND "tamanho_bytes" <= 5242880);

-- tipo de arquivo aceito em cada tipo de anexo (igual a front/lib/arquivos.ts)
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_mime_por_tipo_chk" CHECK (
  CASE "tipo"
    WHEN 'ABERTURA' THEN "mime_type" IN ('image/jpeg', 'image/png')
    WHEN 'FORMULARIO' THEN "mime_type" IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    WHEN 'PROPOSTA' THEN "mime_type" IN (
      'image/jpeg', 'image/png', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ELSE "mime_type" IN ('image/jpeg', 'image/png', 'application/pdf') -- COMPROVACAO, NOTA_FISCAL, PAGAMENTO
  END
);

-- anexo PROPOSTA sempre ligado a uma proposta; os demais nunca
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_proposta_chk"
  CHECK (("tipo" = 'PROPOSTA') = ("proposta_id" IS NOT NULL));

-- documento só com dígitos (CPF 11 ou CNPJ 14)
ALTER TABLE "prestadores" ADD CONSTRAINT "prestadores_documento_chk" CHECK ("documento" ~ '^([0-9]{11}|[0-9]{14})$');

-- e-mail sempre em minúsculas (o vínculo no 1º login é por e-mail)
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_email_minusculo_chk" CHECK ("email" = lower("email"));

-- no máximo 1 proposta TRANSFERIDA/ACEITA por ordem de serviço
CREATE UNIQUE INDEX "propostas_uma_selecionada_idx" ON "propostas" ("ordem_id")
  WHERE "status" IN ('TRANSFERIDA', 'ACEITA');
