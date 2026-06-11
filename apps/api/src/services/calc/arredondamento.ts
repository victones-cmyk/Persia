// apps/api/src/services/calc/arredondamento.ts
// ÚNICO ponto de arredondamento da aplicação (SRD §10, RN obrigatória).
// ROUND_HALF_UP com 2 casas decimais por padrão. Nunca usar Math.round() direto.

export function roundHalfUp(value: number, decimals = 2): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}
// Exemplos: roundHalfUp(1.225) → 1.23 | roundHalfUp(1.224) → 1.22
