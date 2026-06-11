-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('vendedor', 'admin');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('rascunho', 'enviado', 'erro', 'cancelado');

-- CreateEnum
CREATE TYPE "TipoProduto" AS ENUM ('persiana_rolo_blackout', 'persiana_rolo_screen', 'persiana_rolo_translucido', 'persiana_rolo_double_vision', 'persiana_romana_blackout', 'persiana_romana_screen', 'persiana_romana_translucido', 'cortina');

-- CreateTable
CREATE TABLE "lojas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(50) NOT NULL,
    "gc_loja_id" VARCHAR(50),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'vendedor',
    "loja_id" UUID,
    "gc_usuario_id" VARCHAR(50),
    "desconto_max_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo_produto" "TipoProduto" NOT NULL,
    "usuario_id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "gc_orcamento_id" VARCHAR(50),
    "gc_produto_id" VARCHAR(50),
    "status" "StatusOrcamento" NOT NULL DEFAULT 'rascunho',
    "nome_cliente" VARCHAR(150) NOT NULL,
    "gc_cliente_id" VARCHAR(50),
    "tecido_codigo_gc" VARCHAR(50) NOT NULL,
    "tecido_nome" VARCHAR(100) NOT NULL,
    "largura_m" DECIMAL(6,2) NOT NULL,
    "altura_m" DECIMAL(6,2) NOT NULL,
    "dimensao_m" DECIMAL(6,2),
    "tc_m" DECIMAL(6,2),
    "acionamento" VARCHAR(50),
    "cor_acessorio" VARCHAR(20),
    "rolamento" VARCHAR(20),
    "valor_bruto" DECIMAL(10,2) NOT NULL,
    "desconto_pct" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "valor_final" DECIMAL(10,2) NOT NULL,
    "desconto_aprovado_por" UUID,
    "payload_gc_enviado" JSONB,
    "resposta_gc" JSONB,
    "erro_gc" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_orcamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orcamento_id" UUID NOT NULL,
    "descricao" VARCHAR(150) NOT NULL,
    "quantidade" DECIMAL(10,4) NOT NULL,
    "unidade" VARCHAR(20) NOT NULL,
    "preco_unitario" DECIMAL(10,2) NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "itens_orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "chave" VARCHAR(100) NOT NULL,
    "valor" TEXT NOT NULL,
    "descricao" VARCHAR(255),
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "log_acoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "acao" VARCHAR(100) NOT NULL,
    "detalhe" JSONB,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_acoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "orcamentos_usuario_id_criado_em_idx" ON "orcamentos"("usuario_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_gc_orcamento_id_idx" ON "orcamentos"("gc_orcamento_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_desconto_aprovado_por_fkey" FOREIGN KEY ("desconto_aprovado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_acoes" ADD CONSTRAINT "log_acoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
