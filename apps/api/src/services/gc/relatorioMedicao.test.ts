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
    expect(t).toContain('Sacada: 1,00 × 2,57 m');
    expect(t).toContain('Diferença cobrada no pedido 76200.');
  });

  it('lista TODAS as peças, não só as que mudaram', () => {
    // O pedido é o arquivo do que foi fabricado: quem abrir daqui a um ano
    // precisa das medidas inteiras, não de uma errata.
    const t = relatorioPedidoOriginal(dados, { pedido_diferenca: '76200' });
    expect(t).toContain('Sacada: 1,00 × 2,57 m');
    expect(t).toContain('Casal: 1,60 × 1,60 m');
  });

  it('só quem mudou mostra o que havia sido vendido', () => {
    const t = relatorioPedidoOriginal(dados, { pedido_diferenca: '76200' });
    expect(t).toContain('Sacada: 1,00 × 2,57 m   (vendido 0,95 × 2,57 m)');
    expect(t).toContain('\n  Casal: 1,60 × 1,60 m'); // sem "(vendido ...)"
  });

  it('registra a absorção quando não houve cobrança', () => {
    const t = relatorioPedidoOriginal(dados, { absorvida: true, valor: 150 });
    expect(t).toContain('absorvida pela empresa');
    expect(t).toContain('R$ 150,00');
    expect(t).not.toContain('cobrada no pedido');
  });

  it('absorvida NÃO perde as medidas do técnico', () => {
    // Não ter cobrado não torna a medida menos oficial — e é justamente na
    // absorção que ela não existe em nenhum outro lugar do GestãoClick, já que
    // não nasce pedido nenhum para carregá-la.
    const t = relatorioPedidoOriginal(dados, { absorvida: true, valor: 150 });
    expect(t).toContain('Medidas do técnico (todas as peças)');
    expect(t).toContain('Sacada: 1,00 × 2,57 m');
    expect(t).toContain('Casal: 1,60 × 1,60 m');
    expect(t).toContain('OS do Agenda #842');
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

  it('sem itens conferidos, diz isso em vez de deixar a lista vazia', () => {
    const t = relatorioPedidoOriginal({ ...dados, itens: [] }, { absorvida: true, valor: 0 });
    expect(t).toContain('Sem itens conferidos.');
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
    expect(t).toContain('Sacada: 1,00 × 2,57 m');
    expect(t).toContain('Casal: 1,60 × 1,60 m');
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
