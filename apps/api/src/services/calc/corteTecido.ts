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

// ---------------------------------------------------------------------------
// O lote: todas as peças do mesmo tecido num pedido.
//
// Decidir o corte peça a peça é decidir com o número errado, porque a peça ao
// lado usa o mesmo rolo. Duas persianas de 0,80 × 2,40 num rolo de 2,80 saem da
// MESMA faixa de 2,60 m — a Pérsia cobra 5,20 m e debita 5,20 m do estoque.
//
//   rolo 2,80 m de largura
//   ├───0,80───┼───0,80───┼── 1,20 sobra ──┤   ┐
//   │  peça 1  │  peça 2  │                │   │ 2,60 m de rolo
//   │          │          │                │   │ para as duas
//   └──────────┴──────────┴────────────────┘   ┘
//
// Medido nos pedidos enviados (14/09/2026): 380,36 m cobrados contra 330,85 m
// realmente retirados — 15% a mais, em 12 dos 57 lotes.
//
// O PREÇO não muda: continua saindo da receita, peça a peça, como o Victor
// pediu. O que muda é o que vai para a OS e para a baixa de estoque.

export interface PecaDoLote extends PegadaDaPeca {
  /** Como quem chamou identifica esta peça (índice do item no orçamento). */
  ref: number;
}

export interface FaixaDoPlano {
  /** Quanto esta faixa consome ao longo do rolo (m) — a maior peça manda. */
  comprimento: number;
  pecas: { ref: number; largura: number; altura: number; orientacao: Orientacao }[];
  /** Largura do rolo que sobrou nesta faixa. */
  sobra_largura: number;
}

export interface PlanoDoLote {
  rolo: RoloDisponivel;
  faixas: FaixaDoPlano[];
  /** Total retirado do rolo, em comprimento. */
  metros_lineares: number;
  area_consumida_m2: number;
  /**
   * Quanto cada peça leva do total, em metros lineares de rolo.
   *
   * Rateado dentro da faixa pela largura que cada peça ocupa — quem ocupa mais
   * largura leva mais, inclusive da sobra lateral. A soma bate com
   * metros_lineares, que é o que importa para o estoque fechar.
   */
  consumo_por_peca: Record<number, number>;
}

/**
 * Duas estratégias de orientação, porque elas se contradizem.
 *
 * `estreita` atravessa o rolo com o lado menor: sobra largura para a peça
 * seguinte entrar na mesma faixa — bom quando há muitas peças parecidas.
 * `curta` gasta o menor comprimento possível — bom quando a peça vai sozinha na
 * faixa, e é onde girar rende.
 *
 * Nenhuma das duas ganha sempre, e descobrir qual ganha exige tentar. São duas
 * passadas sobre uma lista de poucas peças; o planejador roda as duas e fica
 * com o resultado melhor, em vez de eu escolher no papel a regra errada.
 */
type Estrategia = 'estreita' | 'curta';

function orientarPara(peca: PegadaDaPeca, W: number, podeGirar: boolean, estrategia: Estrategia):
  { largura: number; altura: number; orientacao: Orientacao } | null {
  const emPe = { largura: peca.largura, altura: peca.altura, orientacao: 'normal' as Orientacao };
  const deitada = { largura: peca.altura, altura: peca.largura, orientacao: 'girada' as Orientacao };
  const cabeEmPe = peca.largura <= W + FOLGA_MM;
  const cabeDeitada = podeGirar && peca.altura <= W + FOLGA_MM;

  if (cabeEmPe && cabeDeitada) {
    if (estrategia === 'estreita') return deitada.largura < emPe.largura ? deitada : emPe;
    return deitada.altura < emPe.altura ? deitada : emPe;
  }
  if (cabeEmPe) return emPe;
  if (cabeDeitada) return deitada;
  return null;
}

/**
 * Encaixe em faixas (guilhotina), que é como a mesa de corte trabalha.
 *
 * Ordena da peça mais comprida para a mais curta e vai abrindo faixas ao longo
 * do rolo, enchendo cada uma pela largura. Não é o arranjo ótimo — encaixe
 * bidimensional exato é caro —, mas é explicável para quem corta e sempre
 * melhor que cortar na ordem do pedido. Devolve null se alguma peça não couber
 * neste rolo.
 */
function encaixarNoRolo(pecas: PecaDoLote[], rolo: RoloDisponivel, podeGirar: boolean, estrategia: Estrategia): PlanoDoLote | null {
  const W = rolo.dimensao_m;
  const orientadas: { ref: number; largura: number; altura: number; orientacao: Orientacao }[] = [];
  for (const p of pecas) {
    const o = orientarPara(p, W, podeGirar, estrategia);
    if (!o) return null;
    orientadas.push({ ref: p.ref, ...o });
  }
  orientadas.sort((a, b) => b.altura - a.altura || b.largura - a.largura);

  const faixas: FaixaDoPlano[] = [];
  for (const p of orientadas) {
    const faixa = faixas.find((f) => f.sobra_largura >= p.largura - FOLGA_MM);
    if (faixa) {
      faixa.pecas.push(p);
      faixa.sobra_largura = arredondar(faixa.sobra_largura - p.largura);
    } else {
      // A primeira peça da faixa é a mais comprida das que ainda restam, então
      // o comprimento da faixa nunca precisa crescer depois.
      faixas.push({ comprimento: p.altura, pecas: [p], sobra_largura: arredondar(W - p.largura) });
    }
  }

  const metros = arredondar(faixas.reduce((s, f) => s + f.comprimento, 0));
  const consumo: Record<number, number> = {};
  for (const f of faixas) {
    const larguraUsada = f.pecas.reduce((s, p) => s + p.largura, 0);
    for (const p of f.pecas) {
      const cota = larguraUsada > 0 ? (p.largura / larguraUsada) * f.comprimento : f.comprimento;
      consumo[p.ref] = arredondar((consumo[p.ref] ?? 0) + cota);
    }
  }

  return {
    rolo,
    faixas,
    metros_lineares: metros,
    area_consumida_m2: arredondar(metros * W),
    consumo_por_peca: consumo,
  };
}

/**
 * O melhor plano para o lote, entre os rolos disponíveis.
 *
 * Critério: menor ÁREA retirada do rolo. Comprimento sozinho escolheria o rolo
 * largo à toa — 2,60 m de um rolo de 3,00 tiram mais tecido que 2,60 m de um de
 * 2,00. Empate resolve pelo rolo mais estreito, que deixa o largo livre para a
 * peça que precisa dele.
 */
export function planejarLote(args: {
  pecas: PecaDoLote[];
  rolos: RoloDisponivel[];
  permiteInverter: boolean;
}): PlanoDoLote | null {
  let melhor: PlanoDoLote | null = null;
  for (const rolo of args.rolos) {
    if (!(rolo.dimensao_m > 0)) continue;
    for (const estrategia of ['estreita', 'curta'] as Estrategia[]) {
      const p = encaixarNoRolo(args.pecas, rolo, args.permiteInverter, estrategia);
      if (!p) continue;
      if (
        !melhor ||
        p.area_consumida_m2 < melhor.area_consumida_m2 - 0.0001 ||
        (Math.abs(p.area_consumida_m2 - melhor.area_consumida_m2) <= 0.0001 &&
          p.rolo.dimensao_m < melhor.rolo.dimensao_m)
      ) {
        melhor = p;
      }
    }
  }
  return melhor;
}
