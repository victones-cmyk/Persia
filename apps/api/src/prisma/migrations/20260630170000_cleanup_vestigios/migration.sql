-- Limpeza de vestígios para entrega (Victor/PH 30/06/2026).
-- Remove sobras da função de DESCONTO (removida em 17/06/2026, controlada no GestãoClick)
-- e a tabela "itens_orcamento", que nunca recebeu dados (a verdade dos itens vive em
-- orcamentos.itens_json). Nada disso guarda informação real: descontos sempre 0/null e
-- a tabela está vazia. Sem perda de dado.

-- itens_orcamento: tabela morta (nenhum registro é criado pelo app).
DROP TABLE IF EXISTS "itens_orcamento";

-- Desconto: campos write-only nunca lidos.
ALTER TABLE "orcamentos" DROP CONSTRAINT IF EXISTS "orcamentos_desconto_aprovado_por_fkey";
ALTER TABLE "orcamentos" DROP COLUMN IF EXISTS "desconto_pct";
ALTER TABLE "orcamentos" DROP COLUMN IF EXISTS "desconto_aprovado_por";
ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "desconto_max_pct";
