-- Plano de corte do pedido: para cada tecido, qual rolo, em que sentido e como
-- as pecas se encaixam nas faixas.
--
-- Guardado, e nao recalculado na impressao, porque o catalogo muda: um plano
-- refeito semanas depois poderia desenhar um arranjo diferente daquele que
-- gerou as quantidades ja baixadas do estoque.
ALTER TABLE "orcamentos" ADD COLUMN "plano_corte_json" JSONB;
