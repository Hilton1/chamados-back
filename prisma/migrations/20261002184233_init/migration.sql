-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'SINDICO', 'FISCAL', 'ZELADOR', 'PRESTADOR');

-- CreateEnum
CREATE TYPE "StatusPrestador" AS ENUM ('PENDENTE', 'APROVADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "Urgencia" AS ENUM ('NORMAL', 'URGENTE');

-- CreateEnum
CREATE TYPE "StatusChamado" AS ENUM ('ABERTO', 'AGUARDANDO_APROVACAO', 'EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAnexo" AS ENUM ('ABERTURA', 'FORMULARIO', 'PROPOSTA', 'COMPROVACAO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('ABERTO', 'PROPOSTA_RECEBIDA', 'TRANSFERIDA', 'APROVADA', 'REPROVADA', 'COMPROVACAO_ENVIADA', 'CONCLUIDO', 'CANCELADO', 'AVALIADO');

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
    "perfil" "Perfil" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculos_condominio" (
    "usuario_id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,

    CONSTRAINT "vinculos_condominio_pkey" PRIMARY KEY ("usuario_id","condominio_id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

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
    "aprovado_por_id" UUID,
    "aprovado_em" TIMESTAMP(3),
    "motivo_bloqueio" TEXT,
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
CREATE TABLE "chamados" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "condominio_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "criado_por_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "urgencia" "Urgencia" NOT NULL DEFAULT 'NORMAL',
    "status" "StatusChamado" NOT NULL DEFAULT 'ABERTO',
    "prazo_propostas_ate" TIMESTAMP(3) NOT NULL,
    "aprovado_por_id" UUID,
    "aprovado_em" TIMESTAMP(3),
    "concluido_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "motivo_cancelamento" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chamados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" UUID NOT NULL,
    "chamado_id" UUID NOT NULL,
    "proposta_id" UUID,
    "tipo" "TipoAnexo" NOT NULL DEFAULT 'ABERTURA',
    "enviado_por_id" UUID NOT NULL,
    "nome_original" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_eventos" (
    "id" UUID NOT NULL,
    "chamado_id" UUID NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "autor_id" UUID,
    "texto" TEXT NOT NULL,
    "marco" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propostas" (
    "id" UUID NOT NULL,
    "chamado_id" UUID NOT NULL,
    "prestador_id" UUID NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "disponivel_em" TIMESTAMP(3) NOT NULL,
    "tempo_execucao_horas" INTEGER NOT NULL,
    "observacao" TEXT,
    "status" "StatusProposta" NOT NULL DEFAULT 'ENVIADA',
    "motivo_recusa" TEXT,
    "transferida_por_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" UUID NOT NULL,
    "chamado_id" UUID NOT NULL,
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
CREATE UNIQUE INDEX "categorias_slug_key" ON "categorias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "prestadores_usuario_id_key" ON "prestadores"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "prestadores_documento_key" ON "prestadores"("documento");

-- CreateIndex
CREATE INDEX "prestadores_status_idx" ON "prestadores"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chamados_numero_key" ON "chamados"("numero");

-- CreateIndex
CREATE INDEX "chamados_condominio_id_status_idx" ON "chamados"("condominio_id", "status");

-- CreateIndex
CREATE INDEX "chamados_categoria_id_status_idx" ON "chamados"("categoria_id", "status");

-- CreateIndex
CREATE INDEX "chamados_status_urgencia_prazo_propostas_ate_idx" ON "chamados"("status", "urgencia", "prazo_propostas_ate");

-- CreateIndex
CREATE INDEX "anexos_chamado_id_tipo_idx" ON "anexos"("chamado_id", "tipo");

-- CreateIndex
CREATE INDEX "anexos_proposta_id_idx" ON "anexos"("proposta_id");

-- CreateIndex
CREATE INDEX "chamado_eventos_chamado_id_created_at_idx" ON "chamado_eventos"("chamado_id", "created_at");

-- CreateIndex
CREATE INDEX "propostas_prestador_id_idx" ON "propostas"("prestador_id");

-- CreateIndex
CREATE UNIQUE INDEX "propostas_chamado_id_prestador_id_key" ON "propostas"("chamado_id", "prestador_id");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_chamado_id_key" ON "avaliacoes"("chamado_id");

-- CreateIndex
CREATE INDEX "avaliacoes_prestador_id_idx" ON "avaliacoes"("prestador_id");

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
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_condominio_id_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_aprovado_por_id_fkey" FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_proposta_id_fkey" FOREIGN KEY ("proposta_id") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_eventos" ADD CONSTRAINT "chamado_eventos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "prestadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_transferida_por_id_fkey" FOREIGN KEY ("transferida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "prestadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────── Regras que o Prisma não expressa (ver topo do schema.prisma) ─────────

ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_nota_chk" CHECK ("nota" BETWEEN 1 AND 5);
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_valor_chk" CHECK ("valor" > 0);
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_tempo_execucao_chk" CHECK ("tempo_execucao_horas" > 0);
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_tamanho_chk" CHECK ("tamanho_bytes" <= 5242880);

-- tipo de arquivo aceito em cada tipo de anexo
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_mime_por_tipo_chk" CHECK (
  CASE "tipo"
    WHEN 'ABERTURA' THEN "mime_type" IN ('image/jpeg', 'image/png')
    WHEN 'COMPROVACAO' THEN "mime_type" IN ('image/jpeg', 'image/png', 'application/pdf')
    WHEN 'FORMULARIO' THEN "mime_type" IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    WHEN 'PROPOSTA' THEN "mime_type" IN (
      'image/jpeg', 'image/png', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  END
);

-- anexo do tipo PROPOSTA pertence a uma proposta; os demais, só ao chamado
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_proposta_chk"
  CHECK (("tipo" = 'PROPOSTA') = ("proposta_id" IS NOT NULL));

-- no máximo 1 proposta TRANSFERIDA/ACEITA por chamado
CREATE UNIQUE INDEX "propostas_uma_selecionada_idx" ON "propostas" ("chamado_id")
  WHERE "status" IN ('TRANSFERIDA', 'ACEITA');
