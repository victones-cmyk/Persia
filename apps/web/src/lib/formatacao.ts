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

/**
 * Quantidade para o breakdown: até 4 casas, sem zeros à direita (ex.: 2 → "2",
 * 1,975 → "1,975"). Usa a MESMA precisão do cálculo do subtotal, para que
 * "qtd × preço" bata visualmente com o subtotal exibido por linha.
 */
export function formatQtd(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(valor);
}

/** Remove acentos/diacríticos para busca tolerante (ex.: "varao" casa "VARÃO"). */
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** ROUND_HALF_UP para exibição no cliente (cálculo autoritativo é do backend). */
export function roundHalfUp(value: number, decimals = 2): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}
