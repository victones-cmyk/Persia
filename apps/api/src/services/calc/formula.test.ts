import { describe, it, expect } from 'vitest';
import { evalFormula, evalQuantidade } from './formula';

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

describe('evalQuantidade', () => {
  it('suporta MAX simples e aninhado', () => {
    expect(evalQuantidade('MAX(ALTURA,1.2)', { largura: 1, altura: 0.9, tc: 0.7 })).toBe(1.2);
    expect(evalQuantidade('MAX(ALTURA,1.2)', { largura: 1, altura: 1.8, tc: 1.35 })).toBe(1.8);
  });

  it('calcula quantidade da persiana vertical com altura e area minimas', () => {
    const formula = 'MAX(LARGURA*MAX(ALTURA,1.2),1.5)';

    expect(evalQuantidade(formula, { largura: 1, altura: 1, tc: 0.75 })).toBe(1.5);
    expect(evalQuantidade(formula, { largura: 2, altura: 1, tc: 0.75 })).toBe(2.4);
    expect(evalQuantidade(formula, { largura: 2, altura: 1.5, tc: 1.1 })).toBe(3);
  });

  it('aceita virgula decimal em formulas MAX', () => {
    const formula = 'MAX(LARGURA*MAX(ALTURA,1,2),1,5)';
    expect(evalQuantidade(formula, { largura: 2, altura: 1, tc: 0.75 })).toBe(2.4);
  });

  it('rejeita MAX sem fechamento', () => {
    expect(() => evalQuantidade('MAX(LARGURA,1.5', { largura: 1, altura: 1, tc: 0.75 })).toThrow();
  });
});
