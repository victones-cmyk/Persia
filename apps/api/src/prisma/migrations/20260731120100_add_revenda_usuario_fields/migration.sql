-- Campos exclusivos do perfil revenda: cliente do GestãoClick vinculado, desconto
-- percentual embutido no preço de venda e quais calculadoras a revenda pode acessar.
ALTER TABLE "usuarios" ADD COLUMN "gc_cliente_vinculado_id" VARCHAR(50),
ADD COLUMN "gc_cliente_vinculado_nome" VARCHAR(150),
ADD COLUMN "desconto_percentual" DECIMAL(5,2),
ADD COLUMN "calculadoras_permitidas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
