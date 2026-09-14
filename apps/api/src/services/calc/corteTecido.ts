// apps/api/src/services/calc/corteTecido.ts
// De que rolo e em que sentido cortar a peça — e quanto isso consome de fato.
//
// O rolo é um objeto físico: um comprimento de tecido com uma largura fixa.
// Cortar uma peça consome COMPRIMENTO do rolo; a largura que sobra ao lado não
// volta para a prateleira em pedaço útil. A Pérsia até aqui debitava a área da
// PEÇA, que é sempre menor que a área realmente retirada do rolo.
//
// Peça de 0,80 × 2,60 (já com a folga da receita) num rolo de 3,00 m:
//
//   em pé     ├──0,80──┤            gasta 2,60 m de rolo  ->  7,80 m² retirados
//             │        │
//             │  2,60  │            deitada, a mesma peça cabe na largura do
//             │        │            rolo e gasta só 0,80 m  ->  2,40 m²
//             └────────┘
//
// A mesma peça, no mesmo rolo, custa três vezes mais em material num sentido do
// que no outro. Só que girar muda o sentido da trama, e nem todo tecido aceita
// — quem diz é o campo "PERMITE INVERTER?" do GestãoClick, tecido a tecido.

export type Orientacao = 'normal' | 'girada';

export interface RoloDisponivel {
  id: string;
  nome: string;
  /** Largura útil do rolo (m). */
  dimensao_m: number;
}

/** A pegada da peça no tecido, na orientação normal, JÁ com a folga da receita. */
export interface PegadaDaPeca {
  /** Largura de tecido necessária (m). */
  largura: number;
  /** Comprimento de tecido necessário (m). */
  altura: number;
}

export interface PlanoDeCorte {
  rolo: RoloDisponivel;
  orientacao: Orientacao;
  /** Comprimento retirado do rolo (m) — é isto que a fábrica corta. */
  metros_lineares: number;
  /** Área retirada do rolo: metros_lineares × largura do rolo. */
  area_consumida_m2: number;
  /** Área da peça em si. */
  area_peca_m2: number;
  /** O que sobra ao lado da peça e não vira outra peça deste pedido. */
  desperdicio_m2: number;
}

const arredondar = (n: number, casas = 4): number => {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
};

// Tolerância de 1 mm: medida de obra tem casa decimal demais para comparação
// exata decidir se uma peça de 2,2500001 m cabe num rolo de 2,25 m.
const FOLGA_MM = 0.001;

function plano(rolo: RoloDisponivel, peca: PegadaDaPeca, orientacao: Orientacao): PlanoDeCorte | null {
  const atravessa = orientacao === 'normal' ? peca.largura : peca.altura;
  const aoLongo = orientacao === 'normal' ? peca.altura : peca.largura;
  if (atravessa > rolo.dimensao_m + FOLGA_MM) return null;

  const area = aoLongo * rolo.dimensao_m;
  const areaPeca = peca.largura * peca.altura;
  return {
    rolo,
    orientacao,
    metros_lineares: arredondar(aoLongo),
    area_consumida_m2: arredondar(area),
    area_peca_m2: arredondar(areaPeca),
    desperdicio_m2: arredondar(area - areaPeca),
  };
}

/**
 * Todos os jeitos de cortar esta peça nos rolos disponíveis.
 *
 * `permiteInverter` é do TECIDO, não do rolo: a trama é a mesma em todas as
 * larguras. Quando é falso, só a orientação normal entra na lista.
 */
export function planosDeCorte(args: {
  peca: PegadaDaPeca;
  rolos: RoloDisponivel[];
  permiteInverter: boolean;
}): PlanoDeCorte[] {
  const orientacoes: Orientacao[] = args.permiteInverter ? ['normal', 'girada'] : ['normal'];
  const planos: PlanoDeCorte[] = [];
  for (const rolo of args.rolos) {
    if (!(rolo.dimensao_m > 0)) continue;
    for (const o of orientacoes) {
      const p = plano(rolo, args.peca, o);
      if (p) planos.push(p);
    }
  }
  return planos.sort(compararPlanos);
}

/**
 * Ordena do melhor para o pior.
 *
 * O critério é ÁREA RETIRADA DO ROLO, não metros lineares. Gastar 0,80 m de um
 * rolo de 3,00 m e 0,80 m de um rolo de 2,00 m dá o mesmo comprimento, mas o
 * segundo tira 1,60 m² do estoque e o primeiro tira 2,40 m² — e é a área que
 * custa dinheiro. Ordenar por metros lineares escolheria o rolo largo à toa.
 *
 * Empate técnico (1 cm² de diferença) resolve pelo rolo mais estreito, que
 * deixa o largo livre para a peça que precisa dele; e depois pelo corte normal,
 * que é o que a fábrica faz sem instrução extra.
 */
function compararPlanos(a: PlanoDeCorte, b: PlanoDeCorte): number {
  if (Math.abs(a.area_consumida_m2 - b.area_consumida_m2) > 0.0001) {
    return a.area_consumida_m2 - b.area_consumida_m2;
  }
  if (a.rolo.dimensao_m !== b.rolo.dimensao_m) return a.rolo.dimensao_m - b.rolo.dimensao_m;
  if (a.orientacao !== b.orientacao) return a.orientacao === 'normal' ? -1 : 1;
  return 0;
}

/** O melhor corte, ou null quando a peça não cabe em rolo nenhum. */
export function melhorCorte(args: {
  peca: PegadaDaPeca;
  rolos: RoloDisponivel[];
  permiteInverter: boolean;
}): PlanoDeCorte | null {
  return planosDeCorte(args)[0] ?? null;
}

/**
 * A pegada da peça a partir do que a receita já calcula.
 *
 * Funciona para as duas famílias sem saber a fórmula de nenhuma:
 *  - por área (tela solar): consumo = LARGURA × f(ALTURA) -> altura = consumo/largura
 *  - linear (rolô, double vision): consumo já É o comprimento
 *
 * Tirar a altura da divisão, em vez de repetir o "+0,2" aqui, faz a folga da
 * receita continuar num lugar só. Se o Victor mudar a folga na calculadora,
 * isto acompanha sozinho.
 */
export function pegadaDaPeca(args: {
  largura: number;
  consumo: number;
  unidade: 'm' | 'm²';
}): PegadaDaPeca {
  const altura = args.unidade === 'm²' ? args.consumo / args.largura : args.consumo;
  return { largura: arredondar(args.largura), altura: arredondar(altura) };
}
