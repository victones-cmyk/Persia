// apps/api/src/services/calc/instalacaoCalc.ts
// Formatos da INSTALAÇÃO embutida como componente (Victor 26/06/2026). A instalação
// entra como mais uma linha no breakdown e no snapshot do produto, com quantidade 1
// (uma instalação por peça). Centraliza os formatos para os controllers (cálculo e envio).

import type { TipoInstalacao } from '../gc/instalacao';
import type { LinhaCustoPersiana } from './persianaPreco';

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
export function componenteInstalacao(inst: TipoInstalacao): { grupo: string; descricao: string; quantidade: number; unidade: string } {
  return { grupo: 'instalacao', descricao: `INSTALAÇÃO — ${inst.nome}`, quantidade: 1, unidade: 'un' };
}
