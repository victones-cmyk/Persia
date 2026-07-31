// apps/api/src/services/calc/descontoCalc.ts
// Desconto da revenda: X% do VALOR FINAL, embutido no preço (sem linha separada no
// GestãoClick) — o inverso do RT (que faz gross-up). O desconto reduz o VALOR DE
// VENDA; o custo do produto não muda. % é fixo por revenda (Usuario.desconto_percentual)
// e vale para tudo que ela orçar (persiana, cortina, trilhos especiais, avulsos).

import { roundHalfUp } from './arredondamento';

/** Fator de redução do desconto. pct fora de (0,100) → 1 (sem efeito). */
export function fatorDesconto(pct: number): number {
  const p = Number(pct) || 0;
  if (p <= 0 || p >= 100) return 1;
  return 1 - p / 100;
}

/** Valor com o desconto embutido, arredondado. */
export function valorComDesconto(valorBase: number, pct: number): number {
  return roundHalfUp(valorBase * fatorDesconto(pct));
}

/** Linha do desconto para o snapshot do item (formato {grupo, descricao, quantidade, unidade}). */
export function componenteDesconto(pct: number): { grupo: string; descricao: string; quantidade: number; unidade: string } {
  return { grupo: 'desconto', descricao: `Desconto revenda (${Number(pct) || 0}%)`, quantidade: 1, unidade: '%' };
}
