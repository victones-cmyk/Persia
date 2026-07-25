import { describe, expect, it } from 'vitest';
import { descricaoProdutoCortina, nomeProdutoCortina } from './cortinaProduto';

describe('produto sintetico de cortina', () => {
  it('monta nome curto e descricao detalhada para o GestaoClick', () => {
    const nome = nomeProdutoCortina({ ambiente: 'Sala', largura: 2.5, altura: 2.7 });

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

    // Sem o modelo: ele aparece por camada na descrição, com a prega específica.
    expect(nome).toBe('Cortina Sala L:2,50m X A:2,70m');
    expect(descricao).toBe('Fixação: Trilho | Abertura: Sem abertura | Frente: Wave | Tecido: TEX-101 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 02 – MARROM | Franzido: 2,7x | Forro: Franzido | Tecido: TEX-202 BLACKOUT 70% DE VEDAÇÃO LISO LARGURA: 2,80m COR: 01 – BRANCO | Franzido: 2x');
    expect(descricao).not.toContain('\n');
  });

  // As variantes de prega calculam igual, mas a ficha precisa dizer qual é
  // (o vendedor escolhe Macho/Fêmea/Americana e a produção depende disso).
  it.each([
    ['prega_macho', 'Prega Macho'],
    ['prega_femea', 'Prega Fêmea'],
    ['prega_americana', 'Prega Americana'],
  ] as const)('descreve a variante %s como "%s"', (modelo, label) => {
    const descricao = descricaoProdutoCortina({
      fixacao: 'trilho',
      aberturas: 2,
      camadas: [{ modelo, tecido_nome: 'TEX-005 GAZE MEDITERRÂNEO', franzido: 3 }],
    });
    expect(descricao).toBe(`Fixação: Trilho | Abertura: Central | Frente: ${label} | Tecido: TEX-005 GAZE MEDITERRÂNEO | Franzido: 3x`);
  });

  it('mantém "Prega" genérico para orçamentos antigos, sem variante', () => {
    const descricao = descricaoProdutoCortina({
      fixacao: 'trilho',
      aberturas: 2,
      camadas: [{ modelo: 'prega', tecido_nome: 'TEX-005 GAZE MEDITERRÂNEO', franzido: 3 }],
    });
    expect(descricao).toContain('Frente: Prega |');
  });
});
