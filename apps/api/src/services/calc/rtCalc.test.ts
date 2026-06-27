import { describe, it, expect } from 'vitest';
import { fatorRt, valorComRt, valorRt } from './rtCalc';

describe('rtCalc (gross-up, letra B: RT = % do valor final)', () => {
  it('fator de 10% = 1/0,9', () => {
    expect(fatorRt(10)).toBeCloseTo(1 / 0.9, 10);
  });

  it('0% ou inválido → sem efeito', () => {
    expect(fatorRt(0)).toBe(1);
    expect(fatorRt(-5)).toBe(1);
    expect(fatorRt(100)).toBe(1);
    expect(valorComRt(1000, 0)).toBe(1000);
  });

  it('1000 com RT 10% → 1111,11 e RT = 111,11 (10% do final)', () => {
    expect(valorComRt(1000, 10)).toBe(1111.11);
    expect(valorRt(1000, 10)).toBe(111.11);
    // o RT é ~10% do valor FINAL (gross-up), não do base
    expect(valorRt(1000, 10) / valorComRt(1000, 10)).toBeCloseTo(0.1, 3);
  });

  it('soma por produto bate (cada produto com gross-up)', () => {
    const bases = [606.1, 798.03];
    const grossed = bases.map((b) => valorComRt(b, 10));
    expect(grossed).toEqual([673.44, 886.7]);
    expect(grossed.reduce((s, v) => s + v, 0)).toBeCloseTo(1560.14, 2);
  });
});
