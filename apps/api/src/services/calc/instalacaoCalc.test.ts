import { describe, it, expect } from 'vitest';
import { linhaInstalacaoBreakdown, componenteInstalacao, quantidadeInstalacaoCortina } from './instalacaoCalc';

const INST = { id: '94575642', nome: 'INSTALAÇÃO MANUAL', preco: 38.98, custo: 19.49 };

describe('instalacaoCalc', () => {
  it('linha de breakdown: qtd 1, subtotal = preço, descrição com o nome', () => {
    const l = linhaInstalacaoBreakdown(INST);
    expect(l).toEqual({ codigo_interno: '94575642', descricao: 'INSTALAÇÃO — INSTALAÇÃO MANUAL', quantidade: 1, preco: 38.98, subtotal: 38.98 });
  });

  it('componente do snapshot: grupo instalacao, unidade un, qtd 1', () => {
    const c = componenteInstalacao(INST);
    expect(c).toEqual({ grupo: 'instalacao', descricao: 'INSTALAÇÃO — INSTALAÇÃO MANUAL', quantidade: 1, unidade: 'un' });
  });

  // Faixa padrão de 4 m: o preço do GestãoClick vale por faixa, então uma cortina
  // larga paga mais de uma instalação (vale para manual e motorizada).
  describe('quantidadeInstalacaoCortina', () => {
    it('cobra 1 instalação até o limite exato da faixa', () => {
      expect(quantidadeInstalacaoCortina(1)).toBe(1);
      expect(quantidadeInstalacaoCortina(3.99)).toBe(1);
      expect(quantidadeInstalacaoCortina(4)).toBe(1);
    });

    it('passou da faixa, cobra a próxima unidade inteira', () => {
      expect(quantidadeInstalacaoCortina(4.01)).toBe(2);
      expect(quantidadeInstalacaoCortina(6)).toBe(2);
      expect(quantidadeInstalacaoCortina(8)).toBe(2);
      expect(quantidadeInstalacaoCortina(8.5)).toBe(3);
      expect(quantidadeInstalacaoCortina(12)).toBe(3);
    });

    it('largura inválida não zera a instalação', () => {
      expect(quantidadeInstalacaoCortina(0)).toBe(1);
      expect(quantidadeInstalacaoCortina(Number.NaN)).toBe(1);
    });
  });
});
