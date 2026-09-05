-- Rastro entre o orcamento refeito com as medidas do tecnico e o que ele
-- substituiu. O antigo nao e apagado: vai para "Substituido" no GestaoClick e
-- continua ligado ao sucessor, para dar backtrack de por que o valor mudou.
ALTER TABLE "orcamentos" ADD COLUMN "substitui_orcamento_id" UUID;

ALTER TABLE "orcamentos"
  ADD CONSTRAINT "orcamentos_substitui_orcamento_id_fkey"
  FOREIGN KEY ("substitui_orcamento_id") REFERENCES "orcamentos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orcamentos_substitui_orcamento_id_idx"
  ON "orcamentos"("substitui_orcamento_id");
