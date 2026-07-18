import { describe, it, expect } from 'vitest';
import { ajustarTotalParaQuantidade, roundHalfUp } from './arredondamento';

describe('roundHalfUp (SRD §10)', () => {
  it('arredonda 0,5 para cima', () => {
    expect(roundHalfUp(1.225)).toBe(1.23);
    expect(roundHalfUp(2.5, 0)).toBe(3);
  });

  it('mantém abaixo de 0,5', () => {
    expect(roundHalfUp(1.224)).toBe(1.22);
  });

  it('respeita o número de casas decimais', () => {
    expect(roundHalfUp(1.23456, 4)).toBe(1.2346);
    expect(roundHalfUp(1.5, 0)).toBe(2);
  });

  it('preserva valores já arredondados', () => {
    expect(roundHalfUp(4.3)).toBe(4.3);
    expect(roundHalfUp(0)).toBe(0);
  });
});

describe('ajustarTotalParaQuantidade (RN-10: quantidade x valor_venda deve reconstruir o total)', () => {
  it('ajusta um total que não é múltiplo exato de um preço unitário de 2 casas', () => {
    // 32.98 / 3 = 10.9933...; sem o ajuste, o GC reconstruiria 3 x 10.99 = 32.97.
    const ajustado = ajustarTotalParaQuantidade(32.98, 3);
    expect(ajustado).toBe(32.97);
    expect(roundHalfUp(ajustado / 3)).toBe(10.99);
    expect(roundHalfUp((ajustado / 3) * 3)).toBe(ajustado);
  });

  it('não altera um total que já é múltiplo exato', () => {
    expect(ajustarTotalParaQuantidade(32.97, 3)).toBe(32.97);
  });

  it('é idempotente (aplicar de novo sobre o próprio resultado não muda nada, ex.: após RT)', () => {
    const primeiro = ajustarTotalParaQuantidade(90.01, 7);
    const segundo = ajustarTotalParaQuantidade(primeiro, 7);
    expect(segundo).toBe(primeiro);
  });

  it('quantidade 1 apenas arredonda, sem dividir', () => {
    expect(ajustarTotalParaQuantidade(10.999, 1)).toBe(11);
  });
});
