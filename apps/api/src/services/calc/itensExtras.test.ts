import { describe, expect, it } from 'vitest';
import { calcularComposicaoTrilho, type ProdutoCatalogoOrcamento } from './itensExtras';
import type { CalculadoraTrilhoEspecial } from './calculadorasTrilhoEspecial';

const calculadora: CalculadoraTrilhoEspecial = {
  id: 'trilho_teste',
  nome: 'Trilho Teste',
  db_tipo_produto: 'trilho_especial',
  ativo: true,
  componentes: [
    { codigo_interno: 'TR-001', descricao: 'Perfil', qtd: 'LARGURA' },
    { codigo_interno: 'AC-002', descricao: 'Acessório', qtd: 'LARGURA*2' },
  ],
};

const produtos: ProdutoCatalogoOrcamento[] = [
  { id: '1', nome: 'Perfil de alumínio', codigo_interno: 'TR-001', grupo_id: '', nome_grupo: '', preco_venda: 10, valor_custo: 5 },
  { id: '2', nome: 'Acessório do trilho', codigo_interno: 'AC-002', grupo_id: '', nome_grupo: '', preco_venda: 2, valor_custo: 1 },
];

describe('calculadora de trilhos especiais', () => {
  it('calcula todos os produtos da composição pela largura e quantidade de trilhos', () => {
    const r = calcularComposicaoTrilho(calculadora, 3, 2, produtos);

    expect(r.componentes[0].quantidade).toBe(6);
    expect(r.componentes[0].subtotal).toBe(60);
    expect(r.componentes[1].quantidade).toBe(12);
    expect(r.componentes[1].subtotal).toBe(24);
    expect(r.valor_unitario).toBe(42);
    expect(r.valor_total).toBe(84);
    expect(r.custo_total).toBe(42);
  });

  it('informa quando um produto configurado não existe no catálogo local', () => {
    expect(() => calcularComposicaoTrilho(calculadora, 3, 1, produtos.slice(0, 1)))
      .toThrow(/AC-002.*não foi encontrado/i);
  });
});
