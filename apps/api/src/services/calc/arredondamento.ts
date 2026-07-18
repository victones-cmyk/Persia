// apps/api/src/services/calc/arredondamento.ts
// ÚNICO ponto de arredondamento da aplicação (SRD §10, RN obrigatória).
// ROUND_HALF_UP com 2 casas decimais por padrão. Nunca usar Math.round() direto.

export function roundHalfUp(value: number, decimals = 2): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}
// Exemplos: roundHalfUp(1.225) → 1.23 | roundHalfUp(1.224) → 1.22

/**
 * Ajusta um total para ser um múltiplo exato de um valor unitário de 2 casas
 * decimais. Necessário sempre que o total é enviado ao GestãoClick como
 * quantidade × valor_venda (RN-10): sem isso, a multiplicação de volta no GC
 * pode divergir do total em alguns centavos (ex.: 32.98 ÷ 3 → 10.99, mas
 * 3 × 10.99 = 32.97). Idempotente: aplicar de novo sobre o próprio resultado
 * (ex.: após um gross-up de RT) preserva a consistência.
 */
export function ajustarTotalParaQuantidade(total: number, quantidade: number): number {
  if (quantidade <= 1) return roundHalfUp(total);
  return roundHalfUp(roundHalfUp(total / quantidade) * quantidade);
}
