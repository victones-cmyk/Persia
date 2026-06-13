// Testa a leitura da largura do rolo (dimensaoDoProduto): atributo > nativo > nome.
import { describe, it, expect } from 'vitest';
import { dimensaoDoProduto } from './tecidos';
import type { GcProduto } from './catalogos';

function produto(over: Partial<GcProduto>): GcProduto {
  return {
    id: '1', nome: 'TECIDO X', codigo_interno: 'C', ativo: '1', grupo_id: '235486',
    nome_grupo: 'TECIDOS PARA PERSIANA', largura: '', valor_venda: '0', valores: [],
    ...over,
  };
}

describe('dimensaoDoProduto', () => {
  it('lê a largura do campo extra "LARGURA" (prioridade), mesmo sem metragem no nome', () => {
    const p = produto({
      nome: 'ROLLER STRIPE TRANSLÚCIDO',
      atributos: [{ atributo: { tipo: 'numeros', conteudo: '2,10', descricao: 'LARGURA', atributo_id: 1 } }],
    });
    expect(dimensaoDoProduto(p)).toBe(2.1);
  });

  it('prioriza o atributo sobre o nome', () => {
    const p = produto({
      nome: 'TECIDO ROLO 2,80M',
      atributos: [{ atributo: { tipo: 'numeros', conteudo: '2,00', descricao: 'LARGURA', atributo_id: 1 } }],
    });
    expect(dimensaoDoProduto(p)).toBe(2.0);
  });

  it('usa o campo nativo quando não há atributo', () => {
    expect(dimensaoDoProduto(produto({ largura: '2,50' }))).toBe(2.5);
  });

  it('usa o nome como fallback', () => {
    expect(dimensaoDoProduto(produto({ nome: 'TECIDO ROLO 2,80M PRETO' }))).toBe(2.8);
  });

  it('ignora largura fora da faixa 1–4 m e retorna null sem fonte', () => {
    expect(dimensaoDoProduto(produto({ atributos: [{ atributo: { tipo: 'numeros', conteudo: '9,99', descricao: 'LARGURA', atributo_id: 1 } }] }))).toBeNull();
    expect(dimensaoDoProduto(produto({ nome: 'SEM MEDIDA' }))).toBeNull();
  });
});
