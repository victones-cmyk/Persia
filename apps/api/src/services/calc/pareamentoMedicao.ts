// apps/api/src/services/calc/pareamentoMedicao.ts
// Liga cada ambiente medido às peças do orçamento que ele representa.
//
// Existe porque parear por NOME não funciona e não tem como funcionar: os dois
// lados são texto livre digitado em aparelhos diferentes, por pessoas
// diferentes, em momentos diferentes. O primeiro caso real mostrou os três
// jeitos de quebrar de uma vez — a vendedora escreveu "SALA" nas três cortinas,
// o técnico achou três vãos e os nomeou "SALA ( sanca 15 cm )",
// "Sala ( sanca 15 cm )" e "Sala Jantar ( sanca 15cm )". Nada pareou, e os dois
// primeiros, que normalizam igual, foram somados como se fossem duas faces do
// mesmo vão: 7,05 m, medida que não existe na casa da cliente.
//
// A ligação é ambiente medido → CONJUNTO de peças, e não ambiente → ambiente,
// porque a granularidade dos dois lados raramente coincide:
//
//   3 ambientes medidos → 3 peças     (o caso acima: uma cortina por vão)
//   1 ambiente medido   → 5 peças     (a sacada dividida em folhas)
//
// Pareamento por nome continua valendo como PALPITE INICIAL. O que muda é que
// ele deixa de ser a verdade: quando alguém confirma na tela, a escolha da
// pessoa manda, e é ela que fica gravada.

/** Índices das peças (na lista de entrada do orçamento) de cada ambiente medido. */
export type Pareamento = Record<string, number[]>;

export interface AmbienteParaParear {
  /** Id do ambiente no Agenda — estável, e é a chave do pareamento. */
  id?: string | null;
  nome: string;
}

export interface PecaParaParear {
  /** Posição na lista de itens do orçamento (itens + cortinas, nessa ordem). */
  index: number;
  ambiente: string;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Palpite inicial pelo nome, para a tela não abrir vazia.
 *
 * Casa quando o nome do ambiente medido CONTÉM o nome do ambiente da peça, ou
 * o contrário — assim "SALA" do orçamento encontra "SALA ( sanca 15 cm )" do
 * técnico, que é como as anotações dele costumam aparecer. É palpite: pode
 * errar, e a pessoa corrige. Errar sugerindo é diferente de errar decidindo.
 */
export function sugerirPareamento(
  ambientes: AmbienteParaParear[],
  pecas: PecaParaParear[],
): Pareamento {
  const sugestao: Pareamento = {};
  const pecasLivres = new Set(pecas.map((p) => p.index));

  // Nome igual primeiro; só depois o "um contém o outro". Sem esta ordem, um
  // ambiente de nome curto abocanharia peças que pertencem ao de nome exato.
  for (const passo of ['exato', 'contem'] as const) {
    const casa = (nomeAmbiente: string, nomePeca: string) =>
      passo === 'exato'
        ? nomePeca === nomeAmbiente
        : nomeAmbiente.includes(nomePeca) || nomePeca.includes(nomeAmbiente);

    // Uma peça por rodada, e não o primeiro ambiente levando tudo.
    //
    // No caso real havia três vãos medidos e três peças todas chamadas "SALA":
    // como "SALA" cabe no nome dos três, o primeiro abocanhava as três e os
    // outros dois ficavam órfãos — palpite pior do que nenhum. Em rodadas, cada
    // vão leva uma, o que acerta a forma mais comum (um vão, uma peça) sem
    // atrapalhar a sacada (um vão só, que continua levando todas as folhas nas
    // rodadas seguintes).
    let avancou = true;
    while (avancou) {
      avancou = false;
      for (const amb of ambientes) {
        if (!amb.id) continue;
        const alvo = semAcento(amb.nome);
        if (!alvo) continue;
        const peca = pecas.find((p) => pecasLivres.has(p.index) && p.ambiente.trim() !== '' && casa(alvo, semAcento(p.ambiente)));
        if (!peca) continue;
        (sugestao[amb.id] ??= []).push(peca.index);
        pecasLivres.delete(peca.index);
        avancou = true;
      }
    }
  }

  return sugestao;
}

/**
 * Limpa um pareamento vindo de fora (banco ou requisição).
 *
 * Descarta ambiente desconhecido, índice inexistente e repetição — e garante
 * que cada peça pertença a UM ambiente só. Peça em dois ambientes seria contada
 * duas vezes na comparação e, pior, recalculada duas vezes com medidas
 * diferentes.
 */
export function normalizarPareamento(
  bruto: unknown,
  ambientesValidos: string[],
  totalPecas: number,
): Pareamento {
  const saida: Pareamento = {};
  if (!bruto || typeof bruto !== 'object') return saida;
  const validos = new Set(ambientesValidos);
  const usadas = new Set<number>();

  for (const [ambienteId, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!validos.has(ambienteId) || !Array.isArray(valor)) continue;
    const indices: number[] = [];
    for (const v of valor) {
      const i = Number(v);
      if (!Number.isInteger(i) || i < 0 || i >= totalPecas) continue;
      if (usadas.has(i)) continue;
      usadas.add(i);
      indices.push(i);
    }
    if (indices.length > 0) saida[ambienteId] = indices.sort((a, b) => a - b);
  }
  return saida;
}

/** As peças que ficaram sem ambiente — precisam da atenção de alguém. */
export function pecasSemPareamento(pareamento: Pareamento, totalPecas: number): number[] {
  const usadas = new Set(Object.values(pareamento).flat());
  const sobrando: number[] = [];
  for (let i = 0; i < totalPecas; i++) if (!usadas.has(i)) sobrando.push(i);
  return sobrando;
}
