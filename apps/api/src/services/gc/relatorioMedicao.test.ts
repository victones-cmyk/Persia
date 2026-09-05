import { describe, it, expect } from 'vitest';
import { relatorioPedidoOriginal, relatorioPedidoDiferenca, type DadosRelatorio } from './relatorioMedicao';

const dados: DadosRelatorio = {
  itens: [
    { ambiente: 'Sacada', largura_vendida: 0.95, altura_vendida: 2.57, largura_final: 1, altura_final: 2.57, alterado: true },
    { ambiente: 'Casal', largura_vendida: 1.6, altura_vendida: 1.6, largura_final: 1.6, altura_final: 1.6, alterado: false },
  ],
  os_agenda: [842],
  agenda_base_url: 'https://agenda.texhaus.com.br',
  data: new Date(2026, 8, 5),
};

describe('relatorioPedidoOriginal', () => {
  it('registra as medidas novas e aponta o pedido da diferença', () => {
    const t = relatorioPedidoOriginal(dados, { pedido_diferenca: '76200' });
    expect(t).toContain('Sacada: 0,95 × 2,57 m → 1,00 × 2,57 m');
    expect(t).toContain('Diferença cobrada no pedido 76200.');
  });

  it('não repete o que não mudou', () => {
    const t = relatorioPedidoOriginal(dados, { pedido_diferenca: '76200' });
    expect(t).not.toContain('Casal');
  });

  it('registra a absorção quando não houve cobrança', () => {
    const t = relatorioPedidoOriginal(dados, { absorvida: true, valor: 150 });
    expect(t).toContain('absorvida pela empresa');
    expect(t).toContain('R$ 150,00');
    expect(t).not.toContain('cobrada no pedido');
  });

  it('leva o link da OS do Agenda', () => {
    const t = relatorioPedidoOriginal(dados, { pedido_diferenca: '76200' });
    expect(t).toContain('OS do Agenda #842: https://agenda.texhaus.com.br/?os=842');
  });

  it('sem a base do Agenda, cita a OS sem link em vez de montar link quebrado', () => {
    const t = relatorioPedidoOriginal({ ...dados, agenda_base_url: '' }, { pedido_diferenca: '1' });
    expect(t).toContain('OS do Agenda #842');
    expect(t).not.toContain('http');
  });

  it('barra final na base não vira barra dupla no link', () => {
    const t = relatorioPedidoOriginal({ ...dados, agenda_base_url: 'https://agenda.texhaus.com.br/' }, { pedido_diferenca: '1' });
    expect(t).toContain('https://agenda.texhaus.com.br/?os=842');
  });

  it('conferência sem alteração diz isso, em vez de deixar a lista vazia', () => {
    const t = relatorioPedidoOriginal(
      { ...dados, itens: [{ ...dados.itens[1] }] },
      { absorvida: true, valor: 0 },
    );
    expect(t).toContain('sem alteração');
  });

  it('cita todas as OS quando a medida veio de mais de uma', () => {
    const t = relatorioPedidoOriginal({ ...dados, os_agenda: [842, 900] }, { pedido_diferenca: '1' });
    expect(t).toContain('#842');
    expect(t).toContain('#900');
  });
});

describe('relatorioPedidoDiferenca', () => {
  it('leva as mesmas medidas e aponta de volta o pedido original', () => {
    const t = relatorioPedidoDiferenca(dados, '76127', 150);
    expect(t).toContain('Sacada: 0,95 × 2,57 m → 1,00 × 2,57 m');
    expect(t).toContain('Complemento do pedido 76127');
    expect(t).toContain('R$ 150,00');
  });

  it('os dois pedidos apontam um para o outro', () => {
    const original = relatorioPedidoOriginal(dados, { pedido_diferenca: '76200' });
    const diferenca = relatorioPedidoDiferenca(dados, '76127', 150);
    expect(original).toContain('76200');
    expect(diferenca).toContain('76127');
  });
});
