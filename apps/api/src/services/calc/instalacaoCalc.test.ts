import { describe, it, expect } from 'vitest';
import { linhaInstalacaoBreakdown, componenteInstalacao } from './instalacaoCalc';

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
});
