import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listarProdutos: vi.fn(),
  listarProdutosRemoto: vi.fn(),
  encontrarCalculadoraTrilhoEspecial: vi.fn(),
}));

vi.mock('../gc/catalogos', () => ({
  listarProdutos: mocks.listarProdutos,
  listarProdutosRemoto: mocks.listarProdutosRemoto,
}));

vi.mock('./calculadorasTrilhoEspecial', () => ({
  encontrarCalculadoraTrilhoEspecial: mocks.encontrarCalculadoraTrilhoEspecial,
}));

import { calcularComposicaoTrilho, prepararProdutosAvulsos, prepararTrilhosEspeciais, type ProdutoCatalogoOrcamento } from './itensExtras';
import { roundHalfUp } from './arredondamento';
import type { CalculadoraTrilhoEspecial } from './calculadorasTrilhoEspecial';

const calculadora: CalculadoraTrilhoEspecial = {
  id: 'trilho_teste',
  nome: 'Trilho Teste',
  db_tipo_produto: 'trilho_especial',
  ativo: true,
  componentes: [],
  variantes: [{
    id: 'motorizada', nome: 'Motorizada', motorizado: true, componentes: [
      { codigo_interno: 'TR-001', descricao: 'Perfil', qtd: 'LARGURA' },
      { codigo_interno: 'AC-002', descricao: 'Acessório', qtd: 'LARGURA*2' },
      { codigo_interno: 'EM-003', descricao: 'Emenda', qtd: 'EMENDAS' },
    ],
  }],
};

const produtos: ProdutoCatalogoOrcamento[] = [
  { id: '1', nome: 'Perfil de alumínio', codigo_interno: 'TR-001', grupo_id: '', nome_grupo: '', preco_venda: 10, valor_custo: 5 },
  { id: '2', nome: 'Acessório do trilho', codigo_interno: 'AC-002', grupo_id: '', nome_grupo: '', preco_venda: 2, valor_custo: 1 },
  { id: '3', nome: 'Emenda do trilho', codigo_interno: 'EM-003', grupo_id: '', nome_grupo: '', preco_venda: 3, valor_custo: 1.5 },
];

describe('calculadora de trilhos especiais', () => {
  it('calcula todos os produtos da composição pela largura e quantidade de trilhos', () => {
    const r = calcularComposicaoTrilho(calculadora, { varianteId: 'motorizada', largura: 3, quantidade: 2, emendas: 0, tc: 0 }, produtos);

    expect(r.componentes[0].quantidade).toBe(6);
    expect(r.componentes[0].subtotal).toBe(60);
    expect(r.componentes[1].quantidade).toBe(12);
    expect(r.componentes[1].subtotal).toBe(24);
    expect(r.componentes[2].quantidade).toBe(0);
    expect(r.componentes[2].subtotal).toBe(0);
    expect(r.valor_unitario).toBe(42);
    expect(r.valor_total).toBe(84);
    expect(r.custo_total).toBe(42);
    expect(r.motorizado).toBe(true);
  });

  it('multiplica as emendas informadas pela quantidade de trilhos', () => {
    const r = calcularComposicaoTrilho(calculadora, { varianteId: 'motorizada', largura: 3, quantidade: 2, emendas: 2, tc: 0 }, produtos);

    expect(r.emendas).toBe(2);
    expect(r.componentes[2].quantidade).toBe(4);
    expect(r.componentes[2].subtotal).toBe(12);
    expect(r.valor_total).toBe(96);
  });

  it('informa quando um produto configurado não existe no catálogo local', () => {
    expect(() => calcularComposicaoTrilho(calculadora, { varianteId: 'motorizada', largura: 3, quantidade: 1, emendas: 0, tc: 0 }, produtos.slice(0, 1)))
      .toThrow(/AC-002.*não foi encontrado/i);
  });

  it('usa a primeira variante quando nenhum variante_id é informado (orçamentos salvos antes da feature)', () => {
    const r = calcularComposicaoTrilho(calculadora, { varianteId: undefined, largura: 3, quantidade: 2, emendas: 0, tc: 0 }, produtos);
    expect(r.variante_id).toBe('motorizada');
  });

  it('rejeita um variante_id que não corresponde a nenhuma variante da calculadora', () => {
    expect(() => calcularComposicaoTrilho(calculadora, { varianteId: 'inexistente', largura: 3, quantidade: 1, emendas: 0, tc: 0 }, produtos))
      .toThrow(/variante válida/i);
  });

  it('resolve a variavel TC nas formulas', () => {
    const calculadoraComTc: CalculadoraTrilhoEspecial = {
      ...calculadora,
      variantes: [{
        id: 'com_tc', nome: 'Com TC', motorizado: false, componentes: [
          { codigo_interno: 'TR-001', descricao: 'Perfil', qtd: 'TC' },
        ],
      }],
    };
    const r = calcularComposicaoTrilho(calculadoraComTc, { varianteId: 'com_tc', largura: 3, quantidade: 1, emendas: 0, tc: 2.5 }, produtos);
    expect(r.tc).toBe(2.5);
    expect(r.componentes[0].quantidade).toBe(2.5);
  });
});

describe('prepararTrilhosEspeciais', () => {
  beforeEach(() => {
    mocks.listarProdutos.mockReset();
    mocks.encontrarCalculadoraTrilhoEspecial.mockReset();
    mocks.listarProdutos.mockResolvedValue(produtos);
    mocks.encontrarCalculadoraTrilhoEspecial.mockReturnValue(calculadora);
  });

  it('nao prefixa "Trilho especial" no nome do produto enviado ao GestãoClick', async () => {
    const [item] = await prepararTrilhosEspeciais([{
      calculadora_id: 'trilho_teste', variante_id: 'motorizada', largura: 3, quantidade: 2, emendas: 1,
    }]);
    expect(item.nome_produto).toBe('Trilho Teste — Motorizada');
  });

  it('inclui ambiente, largura, emendas, quantidade, lado do motor, abertura e TC na descrição quando motorizado', async () => {
    const [item] = await prepararTrilhosEspeciais([{
      calculadora_id: 'trilho_teste', variante_id: 'motorizada', largura: 3, quantidade: 2, emendas: 1, tc: 1.2,
      ambiente: 'Sala', lado_motor: 'esquerdo', tipo_abertura: 'esquerda',
    }]);
    expect(item.descricao_produto).toBe(
      'Ambiente: Sala\nLargura: 3 m\nEmendas: 1\nQuantidade: 2\nLado do motor: esquerdo\nAbertura: esquerda\nTC: 1.2 m',
    );
  });

  it('omite lado do motor, abertura e TC quando não motorizado ou TC zerado', async () => {
    const calculadoraManual: CalculadoraTrilhoEspecial = {
      ...calculadora,
      variantes: [{ id: 'manual', nome: 'Manual', motorizado: false, componentes: calculadora.variantes[0].componentes }],
    };
    mocks.encontrarCalculadoraTrilhoEspecial.mockReturnValue(calculadoraManual);
    const [item] = await prepararTrilhosEspeciais([{
      calculadora_id: 'trilho_teste', variante_id: 'manual', largura: 3, quantidade: 2, emendas: 0,
    }]);
    expect(item.descricao_produto).toBe('Largura: 3 m\nEmendas: 0\nQuantidade: 2');
  });

  it('preenche os componentes com os produtos e quantidades calculados, para a OS e a baixa de estoque', async () => {
    const [item] = await prepararTrilhosEspeciais([{
      calculadora_id: 'trilho_teste', variante_id: 'motorizada', largura: 3, quantidade: 2, emendas: 0,
    }]);
    expect(item.componentes).toEqual([
      { descricao: 'Perfil de alumínio (TR-001)', quantidade: 6, unidade: 'un', produto_id: '1' },
      { descricao: 'Acessório do trilho (AC-002)', quantidade: 12, unidade: 'un', produto_id: '2' },
      { descricao: 'Emenda do trilho (EM-003)', quantidade: 0, unidade: 'un', produto_id: '3' },
    ]);
  });
});

describe('prepararProdutosAvulsos', () => {
  beforeEach(() => {
    mocks.listarProdutos.mockReset();
    mocks.listarProdutosRemoto.mockReset();
  });

  it('mantem valor_final como multiplo exato de um preco unitario de 2 casas, mesmo com preco "sujo" no catalogo (RN-10)', async () => {
    mocks.listarProdutos.mockResolvedValue([
      { id: 'p1', nome: 'Parafuso', codigo_interno: 'PAR-1', ativo: '1', grupo_id: '', nome_grupo: '', largura: '', valor_venda: '10.993333333', valores: [] },
    ]);

    const [item] = await prepararProdutosAvulsos([{ produto_id: 'p1', quantidade: 3 }]);

    expect(item.quantidade).toBe(3);
    const precoUnitario = roundHalfUp(item.valor_final / item.quantidade);
    expect(roundHalfUp(precoUnitario * item.quantidade)).toBe(item.valor_final);
  });
});
