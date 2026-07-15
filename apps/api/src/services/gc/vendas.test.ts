import { describe, expect, it } from 'vitest';
import { montarPayloadVenda, OBSERVACOES_CONTRATO_VENDA } from './vendas';

describe('montarPayloadVenda', () => {
  it('converte payload de orçamento para venda sem enviar codigo', () => {
    const payload = montarPayloadVenda({
      codigo: '123',
      tipo: 'produto',
      cliente_id: 'C1',
      situacao_id: '92112',
      data: '2026-07-10',
      produtos: [
        { produto_id: 'P1', quantidade: 1, valor_venda: 100, valor_custo: 20 },
      ],
    });

    expect('codigo' in payload).toBe(false);
    expect(payload.cliente_id).toBe('C1');
    expect(payload.situacao_id).toBe('92112');
    expect(payload.produtos).toEqual([
      { produto: { produto_id: 'P1', quantidade: 1, valor_venda: 100, valor_custo: 20 } },
    ]);
  });

  it('usa tipo produto para payload misto e embrulha serviços', () => {
    const payload = montarPayloadVenda({
      tipo: 'ambos',
      cliente_id: 'C1',
      data: '2026-07-10',
      produtos: [{ produto_id: 'P1', quantidade: 1, valor_venda: 100 }],
      servicos: [{ servico_id: 'S1', quantidade: 2, valor_venda: 50 }],
    });

    expect(payload.tipo).toBe('produto');
    expect(payload.servicos).toEqual([
      { servico: { servico_id: 'S1', quantidade: 2, valor_venda: 50 } },
    ]);
  });

  it('envia o texto padrão de contrato no campo observações da venda', () => {
    const payload = montarPayloadVenda({
      tipo: 'produto',
      cliente_id: 'C1',
      data: '2026-07-10',
      produtos: [{ produto_id: 'P1', quantidade: 1, valor_venda: 100 }],
    });

    expect(payload.observacoes).toBe(OBSERVACOES_CONTRATO_VENDA);
    expect(String(payload.observacoes)).toContain('OBSERVAÇÕES PARA INSTALAÇÃO DE CORTINAS');
  });
});
