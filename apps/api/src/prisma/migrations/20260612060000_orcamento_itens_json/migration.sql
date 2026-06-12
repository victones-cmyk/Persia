-- Orçamento multi-itens: snapshot dos itens (janelas) em JSON.
-- As colunas single existentes seguem guardando o 1º item (compatibilidade).
ALTER TABLE "orcamentos" ADD COLUMN "itens_json" JSONB;
