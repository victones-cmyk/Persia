import { describe, expect, it } from 'vitest';
import { descricaoProdutoPersiana, nomeProdutoPersiana } from './persianaProduto';

describe('produto sintetico de persiana', () => {
  it('monta nome curto e descricao detalhada para o GestaoClick', () => {
    const nome = nomeProdutoPersiana({
      ambiente: 'Sala',
      produto_sob_medida: 'Persiana Rolo Blackout',
      largura: 1.8,
      altura: 2.4,
    });

    const descricao = descricaoProdutoPersiana({
      acionamento: 'com_bando',
      cor_acessorio: 'Branco',
      tecido_nome: 'TEX-101 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 02 – MARROM',
      rolamento: 'Normal',
      comando: 'Direito',
      tc: 1.8,
    });

    expect(nome).toBe('Persiana Sala Rolo Blackout L:1,80m x A:2,40m');
    expect(descricao).toBe('Acionamento: Com Bandô | Acessórios: Branco | Tecido: TEX-101 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 02 – MARROM | Rolamento: Normal | Comando: Direito | Tamanho Comando: 1,80m');
    expect(descricao).not.toContain('\n');
  });
});
