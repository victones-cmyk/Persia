// apps/api/src/services/calc/consumoDoPedido.test.ts
// Os dois erros simétricos que este arquivo existe para corrigir, e a trava que
// impede a correção de mexer no preço.

import { describe, it, expect } from 'vitest';
import { consumoDoPedido, rolosSemMudarPreco, type PecaDoPedido } from './consumoDoPedido';
import type { TecidoDoCatalogo } from './seletorTecido';

const bk: TecidoDoCatalogo = { id: 'bk280', nome: 'LINHO DIGITAL CINZA BK 2,80m', dimensao_m: 2.8, preco_venda: 193.2 };
const bk200: TecidoDoCatalogo = { id: 'bk200', nome: 'LINHO DIGITAL CINZA BK 2,00m', dimensao_m: 2, preco_venda: 140 };
const screen200: TecidoDoCatalogo = { id: 's200', nome: 'SCREEN 3% PANAMA OFF WHITE/01 2,00M', dimensao_m: 2, preco_venda: 42 };
const screen250: TecidoDoCatalogo = { id: 's250', nome: 'SCREEN 3% PANAMA OFF WHITE/01 2,50M', dimensao_m: 2.5, preco_venda: 42 };
const screen300: TecidoDoCatalogo = { id: 's300', nome: 'SCREEN 3% PANAMA OFF WHITE/01 3,00M', dimensao_m: 3, preco_venda: 42 };
const catalogo = [bk, bk200, screen200, screen250, screen300];

const linear = (ref: number, largura: number, altura: number, tecido = bk): PecaDoPedido =>
  ({ ref, largura, consumo: altura + 0.2, unidade: 'm', folhas: 1, tecido });

describe('lineares: para de cobrar uma faixa por peça', () => {
  it('duas peças de 0,80 dividem a faixa — 2,60 m no lugar de 5,20', () => {
    const { porPeca } = consumoDoPedido({ pecas: [linear(0, 0.8, 2.4), linear(1, 0.8, 2.4)], catalogo });
    const total = [0, 1].reduce((s, r) => s + porPeca.get(r)!.quantidade, 0);
    expect(total).toBeCloseTo(2.6, 3);
    expect(porPeca.get(0)!.quantidade).toBeCloseTo(1.3, 3);
    expect(porPeca.get(0)!.unidade).toBe('m');
  });

  it('peça que ocupa o rolo inteiro continua com o consumo de sempre', () => {
    const { porPeca } = consumoDoPedido({ pecas: [linear(0, 2.8, 2.4)], catalogo });
    expect(porPeca.get(0)!.quantidade).toBeCloseTo(2.6, 3);
  });

  it('double vision: as duas folhas encaixam lado a lado', () => {
    const peca: PecaDoPedido = { ref: 0, largura: 0.8, consumo: 2 * 2.6, unidade: 'm', folhas: 2, tecido: bk };
    const { porPeca } = consumoDoPedido({ pecas: [peca], catalogo });
    // 2 folhas de 0,80 numa faixa de 2,80: cabem juntas, 2,60 m em vez de 5,20.
    expect(porPeca.get(0)!.quantidade).toBeCloseTo(2.6, 3);
  });
});

describe('tela solar: passa a debitar a área que sai do rolo', () => {
  it('peça estreita retira a largura inteira da faixa, não a área da peça', () => {
    // 1,00 × 2,00 (já com folga) = 2 m² de peça. No rolo de 2,00 a faixa de
    // 2,00 m tira 4 m², e é isso que sai do estoque.
    const peca: PecaDoPedido = { ref: 0, largura: 1, consumo: 2, unidade: 'm²', folhas: 1, tecido: screen200 };
    const { porPeca } = consumoDoPedido({ pecas: [peca], catalogo });
    expect(porPeca.get(0)!.quantidade).toBeCloseTo(4, 3);
    expect(porPeca.get(0)!.unidade).toBe('m²');
  });

  it('duas peças que dividem a faixa não pagam a largura duas vezes', () => {
    const p = (ref: number): PecaDoPedido => ({ ref, largura: 1, consumo: 2, unidade: 'm²', folhas: 1, tecido: screen200 });
    const { porPeca } = consumoDoPedido({ pecas: [p(0), p(1)], catalogo });
    const total = porPeca.get(0)!.quantidade + porPeca.get(1)!.quantidade;
    expect(total).toBeCloseTo(4, 3); // e não 8
  });

  it('escolhe o rolo mais justo entre os de mesmo preço', () => {
    // 2,40 de largura não cabe no de 2,00, cabe no de 2,50 — e o de 3,00
    // gastaria 6 m² onde o de 2,50 gasta 5.
    const peca: PecaDoPedido = { ref: 0, largura: 2.4, consumo: 2.4 * 2, unidade: 'm²', folhas: 1, tecido: screen200 };
    const { porPeca } = consumoDoPedido({ pecas: [peca], catalogo });
    expect(porPeca.get(0)!.produto_id).toBe('s250');
    expect(porPeca.get(0)!.quantidade).toBeCloseTo(5, 3);
  });

  it('sobe para o rolo largo só quando os estreitos não servem', () => {
    const peca: PecaDoPedido = { ref: 0, largura: 2.6, consumo: 2.6 * 2, unidade: 'm²', folhas: 1, tecido: screen200 };
    const { porPeca } = consumoDoPedido({ pecas: [peca], catalogo });
    expect(porPeca.get(0)!.produto_id).toBe('s300');
  });
});

describe('a trava do preço', () => {
  it('rolos de preços diferentes não entram na disputa', () => {
    // O blackout de 2,00 custa R$ 140 e o de 2,80 R$ 193,20: trocar mudaria o
    // valor do orçamento, então só o escolhido pelo vendedor vale.
    const rolos = rolosSemMudarPreco(bk, catalogo);
    expect(rolos.map((r) => r.id)).toEqual(['bk280']);
  });

  it('rolos de mesmo preço entram todos', () => {
    const rolos = rolosSemMudarPreco(screen200, catalogo);
    expect(rolos.map((r) => r.id).sort()).toEqual(['s200', 's250', 's300']);
  });

  it('o plano nunca troca por um rolo mais caro nem mais barato', () => {
    const { porPeca } = consumoDoPedido({ pecas: [linear(0, 1.5, 2.4, bk)], catalogo });
    expect(porPeca.get(0)!.produto_id).toBe('bk280');
  });
});

describe('girar', () => {
  it('só entra quando o tecido permite', () => {
    const peca: PecaDoPedido = { ref: 0, largura: 0.8, consumo: 0.8 * 2.6, unidade: 'm²', folhas: 1, tecido: screen300 };
    const semGirar = consumoDoPedido({ pecas: [peca], catalogo }).porPeca.get(0)!;
    const girando = consumoDoPedido({ pecas: [peca], catalogo, permiteInverter: () => true }).porPeca.get(0)!;
    expect(girando.quantidade).toBeLessThan(semGirar.quantidade);
  });
});

describe('tecido sem plano viável', () => {
  it('fica de fora em vez de derrubar o pedido', () => {
    const peca: PecaDoPedido = { ref: 0, largura: 9, consumo: 9, unidade: 'm', folhas: 1, tecido: bk };
    const { porPeca } = consumoDoPedido({ pecas: [peca], catalogo });
    expect(porPeca.has(0)).toBe(false);
  });
});
