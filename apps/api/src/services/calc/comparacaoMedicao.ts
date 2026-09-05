// apps/api/src/services/calc/comparacaoMedicao.ts
// Compara o que está no orçamento com o que o técnico mediu na visita.
//
// O orçamento fala em FOLHAS (8 persianas de 1,35m) e a medição fala em VÃO
// (a sacada de 10,80m), então a comparação acontece por ambiente: soma-se a
// largura das folhas daquele ambiente e compara-se com o vão medido.
//
// O pareamento é pelo NOME do ambiente. Quando o orçamento nasce da medição os
// nomes vêm iguais; quando nasce da medida que o cliente passou (o caso em que
// a diferença costuma aparecer), foi o vendedor quem digitou — daí a
// normalização tolerante a acento, caixa e espaço.
//
// Esta função NÃO decide nada: ela mostra. Largura pode divergir por transpasse
// (decisão do vendedor) e não só por erro de medida, então quem lê a diferença
// e resolve o que fazer é gente, não o sistema.

import { roundHalfUp } from './arredondamento';

export interface ItemDoOrcamento {
  ambiente?: string | null;
  largura?: number | null;
  altura?: number | null;
}

export interface AmbienteMedido {
  nome: string;
  largura: number | null;
  altura: number | null;
  medido: boolean;
  /** Em quantas partes o técnico mediu este ambiente (1 = vão contínuo). */
  faces?: number;
}

export type SituacaoAmbiente = 'igual' | 'difere' | 'so_no_orcamento' | 'so_na_medicao';

export interface ComparacaoAmbiente {
  ambiente: string;
  /** Quantas folhas o orçamento tem neste ambiente. */
  folhas: number;
  /**
   * A largura de cada folha, na ordem. Serve para reconhecer o ambiente que na
   * verdade junta DUAS FACES sob um nome só — a sacada com 4 folhas de 1,24 na
   * frente e 1 de 1,06 na lateral. Nesse caso a medida do vão não é um número
   * só, e quem recalcula precisa saber disso antes de confiar na conta.
   */
  larguras_orcadas: number[];
  /**
   * Em quantas partes o técnico mediu. Acima de 1, a largura medida é a soma de
   * faces separadas e não um vão contínuo — repartir isso entre as folhas do
   * orçamento é palpite, e quem recalcula precisa saber.
   */
  faces_medidas: number;
  /** Soma das larguras das folhas — o equivalente ao vão, quando não há transpasse. */
  largura_orcada: number | null;
  /** Altura das folhas; null quando elas divergem entre si (aí não há uma altura só). */
  altura_orcada: number | null;
  largura_medida: number | null;
  altura_medida: number | null;
  diferenca_largura: number | null;
  diferenca_altura: number | null;
  situacao: SituacaoAmbiente;
}

/** Tolerância de 1cm: abaixo disso é arredondamento, não mudança de medida. */
const TOLERANCIA_M = 0.01;

function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const numero = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Compara os itens do orçamento com os ambientes medidos, um ambiente por linha.
 * Ambientes que existem só de um lado aparecem marcados como tal, em vez de
 * sumirem — some quem não vê é que erra.
 */
export function compararMedicao(
  itens: ItemDoOrcamento[],
  ambientes: AmbienteMedido[],
): ComparacaoAmbiente[] {
  // Agrupa as folhas do orçamento por ambiente.
  const porAmbiente = new Map<string, { nome: string; larguras: number[]; alturas: number[] }>();
  for (const it of itens) {
    const nome = (it.ambiente ?? '').trim();
    if (!nome) continue; // item sem ambiente não tem como parear
    const chave = normalizar(nome);
    const g = porAmbiente.get(chave) ?? { nome, larguras: [], alturas: [] };
    const l = numero(it.largura);
    const a = numero(it.altura);
    if (l !== null) g.larguras.push(l);
    if (a !== null) g.alturas.push(a);
    porAmbiente.set(chave, g);
  }

  const medidosPorChave = new Map<string, AmbienteMedido>();
  for (const amb of ambientes) {
    if (!amb.medido) continue; // sem medida estruturada não há o que comparar
    const nome = (amb.nome ?? '').trim();
    if (nome) medidosPorChave.set(normalizar(nome), amb);
  }

  const saida: ComparacaoAmbiente[] = [];
  const usados = new Set<string>();

  for (const [chave, g] of porAmbiente) {
    const med = medidosPorChave.get(chave);
    if (med) usados.add(chave);

    const larguraOrcada = g.larguras.length > 0 ? roundHalfUp(g.larguras.reduce((s, v) => s + v, 0)) : null;
    // Altura só faz sentido como número único quando todas as folhas concordam.
    const alturasUnicas = [...new Set(g.alturas)];
    const alturaOrcada = alturasUnicas.length === 1 ? alturasUnicas[0] : null;

    const larguraMedida = med?.largura ?? null;
    const alturaMedida = med?.altura ?? null;

    const dl = larguraOrcada !== null && larguraMedida !== null ? roundHalfUp(larguraMedida - larguraOrcada) : null;
    const da = alturaOrcada !== null && alturaMedida !== null ? roundHalfUp(alturaMedida - alturaOrcada) : null;

    let situacao: SituacaoAmbiente;
    if (!med) situacao = 'so_no_orcamento';
    else if ((dl !== null && Math.abs(dl) >= TOLERANCIA_M) || (da !== null && Math.abs(da) >= TOLERANCIA_M)) situacao = 'difere';
    else situacao = 'igual';

    saida.push({
      ambiente: g.nome,
      folhas: Math.max(g.larguras.length, g.alturas.length),
      larguras_orcadas: g.larguras,
      faces_medidas: med?.faces ?? 0,
      largura_orcada: larguraOrcada,
      altura_orcada: alturaOrcada,
      largura_medida: larguraMedida,
      altura_medida: alturaMedida,
      diferenca_largura: dl,
      diferenca_altura: da,
      situacao,
    });
  }

  // Ambiente que o técnico mediu e o orçamento não tem: pode ser cômodo que
  // entrou depois da visita, e o vendedor precisa ver isso.
  for (const [chave, med] of medidosPorChave) {
    if (usados.has(chave)) continue;
    saida.push({
      ambiente: med.nome,
      folhas: 0,
      larguras_orcadas: [],
      faces_medidas: med.faces ?? 1,
      largura_orcada: null,
      altura_orcada: null,
      largura_medida: med.largura,
      altura_medida: med.altura,
      diferenca_largura: null,
      diferenca_altura: null,
      situacao: 'so_na_medicao',
    });
  }

  return saida;
}

/** Há alguma divergência que mereça a atenção do vendedor? */
export function temDivergencia(comparacao: ComparacaoAmbiente[]): boolean {
  return comparacao.some((c) => c.situacao === 'difere' || c.situacao === 'so_na_medicao');
}
