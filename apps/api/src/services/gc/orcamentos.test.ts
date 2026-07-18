// Testa a montagem do payload de orçamento do GestãoClick (multi-itens).
import { describe, it, expect } from 'vitest';
import { montarPayload, SITUACAO_EM_ABERTO } from './orcamentos';

describe('montarPayload (orçamento GC multi-itens)', () => {
  it('gera uma linha de produto por item, qtd 1, com valores do item', () => {
    const payload = montarPayload({
      cliente_id: 'C1',
      data: '2026-06-12',
      vendedor_id: 'V1',
      loja_id: 'L1',
      produtos: [
        { gc_produto_id: 'P1', valor_venda: 911.37, valor_custo: 100.5 },
        { gc_produto_id: 'P2', valor_venda: 488.59, valor_custo: 60.25 },
      ],
    });

    expect(payload.tipo).toBe('produto');
    expect(payload.situacao_id).toBe(SITUACAO_EM_ABERTO);
    // NÃO enviar "codigo": o GestãoClick gera o nº sequencial (Victor 18/06).
    expect('codigo' in payload).toBe(false);
    expect(payload.vendedor_id).toBe('V1');
    expect(payload.loja_id).toBe('L1');

    const produtos = payload.produtos as Array<Record<string, unknown>>;
    expect(produtos).toHaveLength(2);
    expect(produtos[0]).toEqual({ produto_id: 'P1', quantidade: 1, valor_venda: 911.37, valor_custo: 100.5 });
    expect(produtos[1]).toEqual({ produto_id: 'P2', quantidade: 1, valor_venda: 488.59, valor_custo: 60.25 });

    // Total do orçamento = soma das linhas (RN-10).
    const total = produtos.reduce((s, p) => s + (p.valor_venda as number), 0);
    expect(total).toBeCloseTo(1399.96, 2);
  });

  it('com serviço de instalação → tipo "ambos" + linha de serviço', () => {
    const payload = montarPayload({
      cliente_id: 'C',
      data: '2026-06-12',
      produtos: [{ gc_produto_id: 'P', valor_venda: 500, valor_custo: 50 }],
      servicos: [{ gc_servico_id: 'S1', valor_venda: 140 }],
    });
    expect(payload.tipo).toBe('ambos');
    const servicos = payload.servicos as Array<Record<string, unknown>>;
    expect(servicos).toEqual([{ servico_id: 'S1', quantidade: 1, valor_venda: 140 }]);
  });

  it('preserva a quantidade informada para produto avulso', () => {
    const payload = montarPayload({
      cliente_id: 'C',
      data: '2026-07-18',
      produtos: [{ gc_produto_id: 'AVULSO', quantidade: 4, valor_venda: 25, valor_custo: 10 }],
    });

    expect(payload.produtos).toEqual([
      { produto_id: 'AVULSO', quantidade: 4, valor_venda: 25, valor_custo: 10 },
    ]);
  });

  it('instalação por peça → serviço com quantidade = nº de peças', () => {
    const payload = montarPayload({
      cliente_id: 'C',
      data: '2026-06-12',
      produtos: [{ gc_produto_id: 'P', valor_venda: 500, valor_custo: 50 }],
      servicos: [{ gc_servico_id: 'INST', valor_venda: 60, quantidade: 3 }], // R$60/peça × 3
    });
    const servicos = payload.servicos as Array<Record<string, unknown>>;
    expect(servicos).toEqual([{ servico_id: 'INST', quantidade: 3, valor_venda: 60 }]);
  });

  it('só serviço → tipo "servico"; sem serviço → sem a chave servicos', () => {
    const soServico = montarPayload({ cliente_id: 'C', data: '2026-06-12', produtos: [], servicos: [{ gc_servico_id: 'S', valor_venda: 80 }] });
    expect(soServico.tipo).toBe('servico');
    const semServico = montarPayload({ cliente_id: 'C', data: '2026-06-12', produtos: [{ gc_produto_id: 'P', valor_venda: 10, valor_custo: 1 }] });
    expect('servicos' in semServico).toBe(false);
  });

  it('omite usuario_id/vendedor_id/loja_id quando ausentes', () => {
    const payload = montarPayload({
      cliente_id: 'C',
      data: '2026-06-12',
      produtos: [{ gc_produto_id: 'P', valor_venda: 10, valor_custo: 1 }],
    });
    expect('usuario_id' in payload).toBe(false);
    expect('vendedor_id' in payload).toBe(false);
    expect('loja_id' in payload).toBe(false);
  });
});
