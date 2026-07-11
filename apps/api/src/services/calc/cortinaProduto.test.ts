import { describe, expect, it } from 'vitest';
import { descricaoProdutoCortina, nomeProdutoCortina } from './cortinaProduto';

describe('produto sintetico de cortina', () => {
  it('monta nome curto e descricao detalhada para o GestaoClick', () => {
    const nome = nomeProdutoCortina({
      ambiente: 'Sala',
      modelo_cortina_nome: 'Cortina Wave',
      modelo_fallback: 'wave',
      largura: 2.5,
      altura: 2.7,
    });

    const descricao = descricaoProdutoCortina({
      fixacao: 'trilho',
      aberturas: 1,
      camadas: [
        {
          modelo: 'wave',
          tecido_nome: 'TEX-101 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 02 – MARROM',
          franzido: 2.7,
        },
        {
          nome: 'Forro',
          modelo: 'franzido',
          tecido_nome: 'TEX-202 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 01 – BRANCO',
          franzido: 2,
        },
      ],
    });

    expect(nome).toBe('Cortina Sala Wave L:2,50m X A:2,70m');
    expect(descricao).toBe('Fixação: Trilho | Abertura: Sem abertura | Frente: Wave | Tecido: TEX-101 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 02 – MARROM | Franzido: 2,7x | Forro: Franzido | Tecido: TEX-202 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 01 – BRANCO | Franzido: 2x');
    expect(descricao).not.toContain('\n');
  });
});
