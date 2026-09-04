import { describe, it, expect } from 'vitest';
import { dividirLarguraEmFolhas } from './divisaoFolhas';

const soma = (v: number[]) => Math.round(v.reduce((s, n) => s + n, 0) * 100) / 100;

describe('dividirLarguraEmFolhas', () => {
  it('divide exato quando a conta fecha (caso real: sacada de 10,80 em 8)', () => {
    expect(dividirLarguraEmFolhas(10.8, 8)).toEqual([1.35, 1.35, 1.35, 1.35, 1.35, 1.35, 1.35, 1.35]);
  });

  it('distribui a sobra para a soma bater com a medida', () => {
    const partes = dividirLarguraEmFolhas(10, 3);

    expect(partes).toEqual([3.34, 3.33, 3.33]);
    expect(soma(partes)).toBe(10);
  });

  it('mantém a soma exata em várias divisões que não fecham', () => {
    for (const [largura, folhas] of [[4.56, 3], [2.85, 7], [1.77, 2], [3.29, 6], [10.01, 9]] as const) {
      const partes = dividirLarguraEmFolhas(largura, folhas);
      expect(partes).toHaveLength(folhas);
      expect(soma(partes)).toBe(largura);
    }
  });

  it('nunca deixa duas folhas com mais de 1cm de diferença', () => {
    const partes = dividirLarguraEmFolhas(10, 3);

    expect(Math.max(...partes) - Math.min(...partes)).toBeCloseTo(0.01, 10);
  });

  it('uma folha só devolve a largura inteira', () => {
    expect(dividirLarguraEmFolhas(2.47, 1)).toEqual([2.47]);
  });

  it('recusa entrada inválida em vez de devolver número sem sentido', () => {
    expect(dividirLarguraEmFolhas(0, 3)).toEqual([]);
    expect(dividirLarguraEmFolhas(-5, 3)).toEqual([]);
    expect(dividirLarguraEmFolhas(2.5, 0)).toEqual([]);
    expect(dividirLarguraEmFolhas(2.5, -1)).toEqual([]);
    expect(dividirLarguraEmFolhas(2.5, 2.5)).toEqual([]);
    expect(dividirLarguraEmFolhas(Number.NaN, 3)).toEqual([]);
  });

  it('recusa dividir em mais folhas do que centímetros disponíveis', () => {
    expect(dividirLarguraEmFolhas(0.05, 8)).toEqual([]);
  });
});
