// apps/api/src/services/calc/rtCalc.ts
// RT (Reserva Técnica) do arquiteto. Victor (27/06/2026): o RT é X% do VALOR FINAL
// (gross-up) → fator = 1/(1 - X/100). Entra EMBUTIDO no preço (sem linha separada no
// GestãoClick) e o % vale para o orçamento todo. Aplicado POR PRODUTO para que a soma
// dos produtos seja igual ao total exibido (RN-10: o que sai da calculadora = GestãoClick).
// O RT aumenta o VALOR DE VENDA; o custo do produto NÃO muda (RT é comissão, não custo).

import { roundHalfUp } from './arredondamento';

/** Fator de gross-up do RT. pct fora de (0,100) → 1 (sem efeito). */
export function fatorRt(pct: number): number {
  const p = Number(pct) || 0;
  if (p <= 0 || p >= 100) return 1;
  return 1 / (1 - p / 100);
}

/** Valor com o RT embutido (gross-up), arredondado. */
export function valorComRt(valorBase: number, pct: number): number {
  return roundHalfUp(valorBase * fatorRt(pct));
}

/** Parte do RT embutida no valor (final - base). */
export function valorRt(valorBase: number, pct: number): number {
  return roundHalfUp(valorComRt(valorBase, pct) - valorBase);
}

/** Linha do RT para o snapshot do item (formato {grupo, descricao, quantidade, unidade}). */
export function componenteRt(pct: number): { grupo: string; descricao: string; quantidade: number; unidade: string } {
  return { grupo: 'rt', descricao: `RT (${Number(pct) || 0}%)`, quantidade: 1, unidade: '%' };
}
