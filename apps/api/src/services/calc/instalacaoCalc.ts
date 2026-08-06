// apps/api/src/services/calc/instalacaoCalc.ts
// Formatos da INSTALAÇÃO embutida como componente (Victor 26/06/2026). A instalação
// entra como mais uma linha no breakdown e no snapshot do produto, com quantidade 1
// (uma instalação por peça). Centraliza os formatos para os controllers (cálculo e envio).

import type { TipoInstalacao } from '../gc/instalacao';
import type { LinhaCustoPersiana } from './persianaPreco';
import { roundHalfUp } from './arredondamento';
import { getRegras } from './regras';

/**
 * Quantidade de instalações de uma CORTINA pela largura: o preço cadastrado no
 * GestãoClick cobre uma faixa (padrão 4 m), então 4 m paga 1, 6 m paga 2, 8 m
 * paga 2, 8,5 m paga 3. Vale para manual e motorizada — muda só o preço unitário
 * do produto escolhido. A faixa é configurável em Regras de Cálculo.
 */
export function quantidadeInstalacaoCortina(largura: number): number {
  const faixa = getRegras().cortina.instalacao_faixa_m;
  if (!(largura > 0) || !(faixa > 0)) return 1;
  return Math.max(1, Math.ceil(roundHalfUp(largura / faixa, 6)));
}

/** Linha da instalação no breakdown de preço (mesmo formato dos componentes da persiana). */
export function linhaInstalacaoBreakdown(inst: TipoInstalacao): LinhaCustoPersiana {
  return {
    codigo_interno: inst.id,
    descricao: `INSTALAÇÃO — ${inst.nome}`,
    quantidade: 1,
    preco: inst.preco,
    subtotal: inst.preco,
  };
}

/** Linha da instalação no snapshot do item (formato {grupo, descricao, quantidade, unidade}). */
export function componenteInstalacao(inst: TipoInstalacao): { grupo: string; descricao: string; quantidade: number; unidade: string; produto_id: string } {
  return { grupo: 'instalacao', descricao: `INSTALAÇÃO — ${inst.nome}`, quantidade: 1, unidade: 'un', produto_id: inst.id };
}
