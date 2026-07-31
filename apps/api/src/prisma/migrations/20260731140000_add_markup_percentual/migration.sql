-- Markup próprio da revenda (definido/editado por ela mesma, diferente do desconto
-- que é do admin) — usado só para mostrar "preço sugerido ao cliente dela".
ALTER TABLE "usuarios" ADD COLUMN "markup_percentual" DECIMAL(5,2);
