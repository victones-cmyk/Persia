-- Adiciona o valor 'misto' ao enum TipoProduto (orçamento com persiana + cortina juntos).
ALTER TYPE "TipoProduto" ADD VALUE IF NOT EXISTS 'misto';
