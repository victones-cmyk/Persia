// apps/api/src/services/calc/recalculoMedicao.ts
// Reescreve as medidas dos itens do orçamento com o que o técnico mediu.
//
// O orçamento fala em FOLHAS e a medição fala em VÃO, então o ajuste é por
// ambiente: pega o vão medido e o reparte entre as folhas que já existem ali.
//
// Reparte MANTENDO A PROPORÇÃO, não em partes iguais. Se o vendedor deixou uma
// folha maior que a outra, foi decisão dele — sobre porta, sobre viga, sobre o
// que ele viu na foto — e recalcular não é hora de desfazer isso. Quando as
// folhas já eram iguais (o caso comum) proporção e divisão igual dão no mesmo.
//
// Duas coisas que esta função deliberadamente NÃO faz:
//
// - Não preserva transpasse. A soma das folhas pode ser maior que o vão de
//   propósito, e não há como distinguir "10 cm de transpasse" de "10 cm de erro
//   de medida" olhando só os dois números. Quem sabe é o vendedor, então o
//   resultado sai como RASCUNHO para ele conferir folha a folha antes de enviar
//   — e a tela avisa que o transpasse precisa ser refeito.
// - Não cria ambiente que só existe na medição. Quantas folhas aquele vão vira
//   é decisão de venda, não dado de medição; inventar um número seria inventar
//   um preço.

import { roundHalfUp } from './arredondamento';

export interface ItemComMedida {
  ambiente?: string | null;
  largura?: number | null;
  altura?: number | null;
  [k: string]: unknown;
}

export interface AmbienteMedido {
  nome: string;
  largura: number | null;
  altura: number | null;
}

export interface MudancaAmbiente {
  ambiente: string;
  folhas: number;
  largura_antes: number | null;
  largura_depois: number | null;
  altura_antes: number | null;
  altura_depois: number | null;
  larguras_antes: number[];
  larguras_depois: number[];
}

export interface ResultadoRecalculo<T> {
  itens: T[];
  mudancas: MudancaAmbiente[];
  /** Ambientes medidos que o orçamento não tem — o vendedor decide se entram. */
  so_na_medicao: string[];
}

/** Mesma normalização da comparação: o pareamento é por nome digitado por gente. */
function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const positivo = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Tolerância de 1cm, igual à da comparação: abaixo disso é arredondamento. */
const TOLERANCIA_M = 0.01;

/**
 * Reparte `novoTotal` entre folhas que hoje medem `atuais`, mantendo a proporção
 * entre elas e somando exatamente o total pedido.
 *
 * Trabalha em centímetros inteiros porque é a unidade em que as medidas são
 * dadas e cortadas; o resto da divisão vai para as primeiras folhas, de um em
 * um centímetro, que é o que faz a soma fechar sem sobra.
 */
export function redistribuirLargura(atuais: number[], novoTotal: number): number[] {
  if (atuais.length === 0) return [];
  if (!Number.isFinite(novoTotal) || novoTotal <= 0) return [];

  const totalCent = Math.round(novoTotal * 100);
  if (totalCent < atuais.length) return []; // não dá nem 1cm por folha

  const somaAtual = atuais.reduce((s, v) => s + v, 0);
  // Sem largura anterior utilizável não há proporção a preservar: divide igual.
  const pesos = somaAtual > 0 ? atuais : atuais.map(() => 1);
  const somaPesos = pesos.reduce((s, v) => s + v, 0);

  const brutos = pesos.map((p) => (totalCent * p) / somaPesos);
  const chao = brutos.map((b) => Math.max(1, Math.floor(b)));
  let sobra = totalCent - chao.reduce((s, v) => s + v, 0);

  // Sobra vai para quem tem a maior parte fracionária — mesma regra do maior
  // resto, para o arredondamento não pender sempre para as primeiras folhas.
  const ordem = brutos
    .map((b, i) => ({ i, frac: b - Math.floor(b) }))
    .sort((a, b) => b.frac - a.frac);
  const saida = [...chao];
  let k = 0;
  while (sobra > 0 && ordem.length > 0) {
    saida[ordem[k % ordem.length].i] += 1;
    sobra -= 1;
    k += 1;
  }
  // Total menor que a soma dos pisos (folhas demais para o vão): tira de quem
  // está maior, nunca deixando ninguém abaixo de 1cm.
  while (sobra < 0) {
    const maior = saida.indexOf(Math.max(...saida));
    if (saida[maior] <= 1) break;
    saida[maior] -= 1;
    sobra += 1;
  }

  return saida.map((c) => c / 100);
}

/**
 * Aplica as medidas do técnico aos itens do orçamento.
 *
 * Devolve itens novos (não altera os recebidos) e o relatório do que mudou, para
 * a tela mostrar "de → para" antes de o vendedor confirmar. Ambiente sem
 * divergência real fica intocado e fora do relatório: o que não mudou não
 * precisa de revisão.
 */
export function recalcularComMedicao<T extends ItemComMedida>(
  itens: T[],
  ambientes: AmbienteMedido[],
): ResultadoRecalculo<T> {
  const medidos = new Map<string, AmbienteMedido>();
  for (const a of ambientes) {
    const nome = (a.nome ?? '').trim();
    if (nome) medidos.set(normalizar(nome), a);
  }

  // Índices dos itens de cada ambiente, na ordem em que aparecem — a ordem é o
  // que liga cada folha à sua nova largura.
  const indicesPorAmbiente = new Map<string, number[]>();
  for (let i = 0; i < itens.length; i++) {
    const nome = (itens[i].ambiente ?? '').trim();
    if (!nome) continue;
    const chave = normalizar(nome);
    const lista = indicesPorAmbiente.get(chave) ?? [];
    lista.push(i);
    indicesPorAmbiente.set(chave, lista);
  }

  const saida = itens.map((it) => ({ ...it }));
  const mudancas: MudancaAmbiente[] = [];

  for (const [chave, indices] of indicesPorAmbiente) {
    const med = medidos.get(chave);
    if (!med) continue;

    const largurasAntes = indices.map((i) => positivo(saida[i].largura) ?? 0);
    const somaAntes = largurasAntes.reduce((s, v) => s + v, 0);
    const alturasAntes = indices.map((i) => positivo(saida[i].altura));
    const alturasUnicas = [...new Set(alturasAntes.filter((a): a is number => a !== null))];
    const alturaAntes = alturasUnicas.length === 1 ? alturasUnicas[0] : null;

    const novaLargura = positivo(med.largura);
    const novaAltura = positivo(med.altura);

    const mudaLargura =
      novaLargura !== null && Math.abs(roundHalfUp(novaLargura - somaAntes)) >= TOLERANCIA_M;
    // Altura só é reescrita quando havia UMA altura no ambiente. Alturas
    // diferentes entre folhas são intencionais (escada, sanca) e uma medida só
    // não sabe reproduzi-las.
    const mudaAltura =
      novaAltura !== null && alturaAntes !== null && Math.abs(roundHalfUp(novaAltura - alturaAntes)) >= TOLERANCIA_M;

    if (!mudaLargura && !mudaAltura) continue;

    const largurasDepois = mudaLargura ? redistribuirLargura(largurasAntes, novaLargura) : largurasAntes;
    // Redistribuição impossível (vão menor que o número de folhas): não mexe na
    // largura em vez de gravar medida absurda.
    const aplicaLargura = mudaLargura && largurasDepois.length === indices.length;

    if (!aplicaLargura && !mudaAltura) continue;

    indices.forEach((idx, pos) => {
      if (aplicaLargura) saida[idx] = { ...saida[idx], largura: largurasDepois[pos] };
      if (mudaAltura) saida[idx] = { ...saida[idx], altura: novaAltura };
    });

    mudancas.push({
      ambiente: (itens[indices[0]].ambiente ?? '').trim(),
      folhas: indices.length,
      largura_antes: somaAntes > 0 ? roundHalfUp(somaAntes) : null,
      largura_depois: aplicaLargura ? roundHalfUp(largurasDepois.reduce((s, v) => s + v, 0)) : null,
      altura_antes: alturaAntes,
      altura_depois: mudaAltura ? novaAltura : null,
      larguras_antes: largurasAntes,
      larguras_depois: aplicaLargura ? largurasDepois : largurasAntes,
    });
  }

  const noOrcamento = new Set(indicesPorAmbiente.keys());
  const soNaMedicao = [...medidos.values()]
    .filter((a) => !noOrcamento.has(normalizar(a.nome)) && positivo(a.largura) !== null)
    .map((a) => a.nome);

  return { itens: saida, mudancas, so_na_medicao: soNaMedicao };
}
