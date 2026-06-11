import { describe, it, expect } from 'vitest';
import { evalFormula } from './formula';

const V = { largura: 1.5, altura: 2 };

describe('evalFormula', () => {
  it('número puro', () => {
    expect(evalFormula('1', V)).toBe(1);
    expect(evalFormula('28', V)).toBe(28);
  });

  it('substitui [Largura] e [Altura]', () => {
    expect(evalFormula('[Largura]', V)).toBe(1.5);
    expect(evalFormula('[Altura]', V)).toBe(2);
  });

  it('subtração com decimais', () => {
    expect(evalFormula('[Largura]-0.02', V)).toBeCloseTo(1.48, 10);
    expect(evalFormula('[Largura]-0.025', V)).toBeCloseTo(1.475, 10);
    expect(evalFormula('[Largura]-0.3', V)).toBeCloseTo(1.2, 10);
  });

  it('multiplicação', () => {
    expect(evalFormula('[Largura]*12', V)).toBe(18);
    expect(evalFormula('[Altura]*2', V)).toBe(4);
    expect(evalFormula('[Altura]*2.20', V)).toBeCloseTo(4.4, 10);
  });

  it('divisão (contagem) e precedência * /', () => {
    expect(evalFormula('[Largura]/0.5', V)).toBe(3);
    expect(evalFormula('[Largura]/0.5*4', V)).toBe(12);
    expect(evalFormula('[Largura]/0.5*[Altura]', V)).toBe(6);
  });

  it('adição', () => {
    expect(evalFormula('[Largura]+[Altura]', V)).toBe(3.5);
    expect(evalFormula('[Largura]+0.5', V)).toBe(2);
  });

  it('lança em fórmula inválida', () => {
    expect(() => evalFormula('[Largura]+', V)).toThrow();
    expect(() => evalFormula('*2', V)).toThrow();
    expect(() => evalFormula('', V)).toThrow();
  });
});
