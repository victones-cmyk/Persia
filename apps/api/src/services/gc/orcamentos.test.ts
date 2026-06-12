// Testa a montagem do payload de orçamento do GestãoClick (multi-itens).
import { describe, it, expect } from 'vitest';
import { montarPayload, SITUACAO_EM_ABERTO } from './orcamentos';

describe('montarPayload (orçamento GC multi-itens)', () => {
  it('gera uma linha de produto por item, qtd 1, com valores do item', () => {
    const payload = montarPayload({
      codigo: 1700000000,
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

  it('omite usuario_id/vendedor_id/loja_id quando ausentes', () => {
    const payload = montarPayload({
      codigo: 1,
      cliente_id: 'C',
      data: '2026-06-12',
      produtos: [{ gc_produto_id: 'P', valor_venda: 10, valor_custo: 1 }],
    });
    expect('usuario_id' in payload).toBe(false);
    expect('vendedor_id' in payload).toBe(false);
    expect('loja_id' in payload).toBe(false);
  });
});
