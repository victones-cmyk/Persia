CREATE TABLE "gc_produtos_locais" (
  "id" VARCHAR(50) NOT NULL,
  "nome" VARCHAR(255) NOT NULL,
  "codigo_interno" VARCHAR(100),
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "grupo_id" VARCHAR(50),
  "nome_grupo" VARCHAR(150),
  "largura" VARCHAR(50),
  "valor_venda" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "valores" JSONB,
  "atributos" JSONB,
  "raw_json" JSONB NOT NULL,
  "sincronizado_em" TIMESTAMPTZ NOT NULL,
  "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gc_produtos_locais_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gc_produtos_locais_grupo_id_idx" ON "gc_produtos_locais"("grupo_id");
CREATE INDEX "gc_produtos_locais_codigo_interno_idx" ON "gc_produtos_locais"("codigo_interno");
CREATE INDEX "gc_produtos_locais_ativo_idx" ON "gc_produtos_locais"("ativo");
