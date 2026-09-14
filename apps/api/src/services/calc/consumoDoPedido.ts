// apps/api/src/services/calc/consumoDoPedido.ts
// Quanto de tecido o PEDIDO consome, depois de encaixar as peças no rolo.
//
// Até aqui cada peça carregava seu consumo isolado, e isso erra nos dois
// sentidos ao mesmo tempo:
//
//   tela solar  debita a área da PEÇA, e o rolo perde a largura inteira da faixa
//   lineares    debitam uma faixa por peça, mesmo quando três saem da mesma
//
// Medido nos pedidos enviados (14/09/2026): 331,71 m² a menos na tela solar,
// 49,51 m a mais nas lineares. As duas somem quando o corte é planejado por
// LOTE — todas as peças do mesmo tecido num pedido.
//
// O PREÇO não passa por aqui. Ele continua saindo da receita, peça a peça,
// exatamente como está hoje (Victor, 14/09/2026): o cliente paga o que sempre
// pagou, e quem passa a falar a verdade é a OS e a baixa de estoque.

import { planejarLote, type PlanoDoLote, type PecaDoLote, type RoloDisponivel } from './corteTecido';
import { mesmoTecido, type TecidoDoCatalogo } from './seletorTecido';
import { roundHalfUp } from './arredondamento';

export interface PecaDoPedido {
  /** Índice do item no pedido — como o chamador reencontra a peça. */
  ref: number;
  largura: number;
  /** Consumo que a receita calculou para esta peça, na unidade abaixo. */
  consumo: number;
  unidade: string;
  /** Folhas separadas (double vision = 2). */
  folhas: number;
  tecido: TecidoDoCatalogo;
}

export interface ConsumoDaPeca {
  /** Quantidade que vai para a OS e para a baixa de estoque. */
  quantidade: number;
  unidade: string;
  /** Produto do rolo efetivamente cortado. */
  produto_id: string;
  tecido_nome: string;
}

export interface LotePlanejado {
  tecido_nome: string;
  plano: PlanoDoLote;
  unidade: string;
  refs: number[];
}

/**
 * Rolos que o plano pode escolher sem mexer no preço.
 *
 * O rolo escolhido pelo vendedor é a referência do orçamento, e trocá-lo por
 * baixo mudaria o valor já apresentado ao cliente. Então só entram na disputa
 * os rolos que custam o MESMO por unidade — o caso da tela solar, onde as três
 * larguras saem por R$ 42,00/m² e a escolha é só de aproveitamento.
 *
 * Onde o preço difere (as famílias lineares), a escolha continua sendo do
 * vendedor, e é a Fase 2 que a mostra com o valor de cada opção.
 */
export function rolosSemMudarPreco(escolhido: TecidoDoCatalogo, catalogo: TecidoDoCatalogo[]): RoloDisponivel[] {
  const mesmos = catalogo.filter(
    (t) => mesmoTecido(escolhido, t) && Math.abs(t.preco_venda - escolhido.preco_venda) < 0.005,
  );
  const lista = mesmos.some((t) => t.id === escolhido.id) ? mesmos : [escolhido, ...mesmos];
  return lista.map((t) => ({ id: t.id, nome: t.nome, dimensao_m: t.dimensao_m }));
}

/** Retângulos que a peça ocupa no rolo — um por folha. */
function retangulos(p: PecaDoPedido): { largura: number; altura: number }[] {
  const folhas = Math.max(1, Math.floor(p.folhas || 1));
  // Em m² o consumo é área: a altura sai da divisão pela largura, sem repetir a
  // folga da receita aqui. Em metro linear o consumo já é o comprimento.
  const comprimentoTotal = p.unidade === 'm²' ? p.consumo / p.largura : p.consumo;
  const altura = comprimentoTotal / folhas;
  return Array.from({ length: folhas }, () => ({ largura: p.largura, altura }));
}

/**
 * Planeja o corte de cada tecido do pedido e devolve o consumo real por peça.
 *
 * Melhor esforço por lote: um tecido cujas peças não cabem em rolo nenhum fica
 * de fora e mantém o consumo da receita. É o comportamento de hoje, e é melhor
 * que derrubar o pedido inteiro — a RN-01 já barra peça larga demais antes
 * disso, então cair aqui significa que apareceu um caso que ninguém previu.
 */
export function consumoDoPedido(args: {
  pecas: PecaDoPedido[];
  /** Todos os tecidos do catálogo, para achar os rolos irmãos. */
  catalogo: TecidoDoCatalogo[];
  /** tecido_id → permite girar. Ausente = não gira. */
  permiteInverter?: (tecido: TecidoDoCatalogo) => boolean;
}): { porPeca: Map<number, ConsumoDaPeca>; lotes: LotePlanejado[] } {
  const porPeca = new Map<number, ConsumoDaPeca>();
  const lotes: LotePlanejado[] = [];

  // Agrupa por tecido — o lote é o conjunto de peças que dividem o mesmo rolo.
  const grupos: PecaDoPedido[][] = [];
  for (const peca of args.pecas) {
    const grupo = grupos.find((g) => mesmoTecido(g[0].tecido, peca.tecido));
    if (grupo) grupo.push(peca);
    else grupos.push([peca]);
  }

  for (const grupo of grupos) {
    const base = grupo[0];
    const rolos = rolosSemMudarPreco(base.tecido, args.catalogo);
    const inverte = args.permiteInverter ? args.permiteInverter(base.tecido) : false;

    // Cada folha vira um retângulo com ref própria, para o rateio saber de qual
    // peça cada uma veio depois.
    const pecasDoLote: PecaDoLote[] = [];
    const folhaDaPeca = new Map<number, number[]>();
    let seq = 0;
    for (const p of grupo) {
      const refs: number[] = [];
      for (const r of retangulos(p)) {
        pecasDoLote.push({ ref: seq, largura: r.largura, altura: r.altura });
        refs.push(seq);
        seq++;
      }
      folhaDaPeca.set(p.ref, refs);
    }

    const plano = planejarLote({ pecas: pecasDoLote, rolos, permiteInverter: inverte });
    if (!plano) continue; // sem plano viável: cada peça fica com o consumo da receita

    lotes.push({ tecido_nome: base.tecido.nome, plano, unidade: base.unidade, refs: grupo.map((p) => p.ref) });

    for (const p of grupo) {
      const metros = (folhaDaPeca.get(p.ref) ?? []).reduce((s, r) => s + (plano.consumo_por_peca[r] ?? 0), 0);
      // Em m² a baixa é a área retirada do rolo (metros × largura do rolo), que
      // é como o estoque ENTRA no GestãoClick: o ERP converte a compra em metro
      // linear multiplicando pela largura (Victor, 14/09/2026). Assim os dois
      // lados da conta falam a mesma língua.
      const quantidade = p.unidade === 'm²' ? metros * plano.rolo.dimensao_m : metros;
      porPeca.set(p.ref, {
        quantidade: roundHalfUp(quantidade, 4),
        unidade: p.unidade,
        produto_id: plano.rolo.id,
        tecido_nome: plano.rolo.nome,
      });
    }
  }

  return { porPeca, lotes };
}
