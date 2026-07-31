import { describe, it, expect } from 'vitest';
import { fatorDesconto, valorComDesconto, componenteDesconto } from './descontoCalc';

describe('descontoCalc (desconto da revenda, embutido no valor de venda)', () => {
  it('fator de 15% = 0,85', () => {
    expect(fatorDesconto(15)).toBeCloseTo(0.85, 10);
  });

  it('0% ou inválido → sem efeito', () => {
    expect(fatorDesconto(0)).toBe(1);
    expect(fatorDesconto(-5)).toBe(1);
    expect(fatorDesconto(100)).toBe(1);
    expect(valorComDesconto(1000, 0)).toBe(1000);
  });

  it('1000 com desconto de 15% → 850', () => {
    expect(valorComDesconto(1000, 15)).toBe(850);
  });

  it('componenteDesconto identifica o grupo e o percentual na descrição', () => {
    const c = componenteDesconto(15);
    expect(c.grupo).toBe('desconto');
    expect(c.descricao).toContain('15%');
  });
});
