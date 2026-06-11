// apps/web/src/lib/formatacao.ts
// Formatação pt-BR para exibição (DS §3). Valores monetários sempre 2 casas.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return BRL.format(valor);
}

export function formatNum(valor: number, casas = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

/** ROUND_HALF_UP para exibição no cliente (cálculo autoritativo é do backend). */
export function roundHalfUp(value: number, decimals = 2): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}
