CREATE TYPE "StatusOrdemProducao" AS ENUM ('criada', 'impressa', 'cancelada');

ALTER TABLE "orcamentos"
  ADD COLUMN "gc_pedido_id" VARCHAR(50),
  ADD COLUMN "gc_pedido_codigo" VARCHAR(50),
  ADD COLUMN "pedido_confirmado_em" TIMESTAMPTZ;

CREATE TABLE "ordens_producao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(30) NOT NULL,
    "orcamento_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "item_index" INTEGER NOT NULL,
    "gc_pedido_id" VARCHAR(50),
    "gc_pedido_codigo" VARCHAR(50) NOT NULL,
    "tipo_produto" "TipoProduto" NOT NULL,
    "status" "StatusOrdemProducao" NOT NULL DEFAULT 'criada',
    "item_snapshot_json" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impresso_em" TIMESTAMPTZ,

    CONSTRAINT "ordens_producao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ordens_producao_codigo_key" ON "ordens_producao"("codigo");
CREATE UNIQUE INDEX "ordens_producao_orcamento_id_item_index_key" ON "ordens_producao"("orcamento_id", "item_index");
CREATE INDEX "ordens_producao_orcamento_id_idx" ON "ordens_producao"("orcamento_id");
CREATE INDEX "ordens_producao_gc_pedido_codigo_idx" ON "ordens_producao"("gc_pedido_codigo");

ALTER TABLE "ordens_producao"
  ADD CONSTRAINT "ordens_producao_orcamento_id_fkey"
  FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ordens_producao"
  ADD CONSTRAINT "ordens_producao_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
