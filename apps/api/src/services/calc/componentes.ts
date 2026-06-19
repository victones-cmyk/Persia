// apps/api/src/services/calc/componentes.ts
// Componentes da persiana: fixos (RN-05), condicionais (RN-06) e base/tampa (RN-07).
// Valores e fórmulas extraídos de base_3_DecorSoft (abas 06, 07, 08).
//
// NOTA (divergência registrada vs SRD §RN-05): a tabela simplificada do SRD lista
// fita dupla/colante como "1 un". A extração real do DecorSoft (aba 06) define-as
// em metros por fórmula ([Largura]-0.02 / [Largura]-0.03 no rolo; [Largura] na romana).
// Seguimos a planilha conforme instrução explícita ("usar os valores corretos de base_3").
// Componentes NÃO entram no valor_bruto (RN-03 = só tecido); compõem a lista técnica/OS.

import { META, type TipoPersiana, type Cor, type Acionamento } from './tipos';
import type { ComponenteCalculado } from './componentes.types';
import { COND_DATA } from './componentes.data';
import { evalFormula } from './formula';
import { roundHalfUp } from './arredondamento';
import { getRegras } from './regras';

const COR_UPPER: Record<Cor, string> = {
  Branco: 'BRANCO',
  Bege: 'BEGE',
  Cinza: 'CINZA',
  Preto: 'PRETO',
};

/** Quantidade de componente arredondada para 4 casas (itens_orcamento DECIMAL(10,4)). */
function qtd(formula: string, largura: number, altura: number): number {
  return roundHalfUp(evalFormula(formula, { largura, altura }), 4);
}

// ---------------------------------------------------------------------------
// RN-05 — Componentes fixos (todos os tipos)
// ---------------------------------------------------------------------------
export function componentesFixos(tipo: TipoPersiana, largura: number): ComponenteCalculado[] {
  const meta = META[tipo];
  const rolo = meta.familia === 'rolo';
  const reg = getRegras().persiana;

  // Fita: rolo desconta margem (parametrizável); romana usa largura cheia.
  const fitaDupla = rolo ? `[Largura]-${reg.fita_dupla_desconto_rolo}` : '[Largura]';
  const fitaColante = rolo ? `[Largura]-${reg.fita_colante_desconto_rolo}` : '[Largura]';

  return [
    { grupo: 'fixo', descricao: 'FITA DUPLA FACE', quantidade: qtd(fitaDupla, largura, 0), unidade: 'm' },
    { grupo: 'fixo', descricao: 'FITA COLANTE 15MM', quantidade: qtd(fitaColante, largura, 0), unidade: 'm' },
    { grupo: 'fixo', descricao: 'EMBALAGEM DE PERSIANA', quantidade: 1, unidade: 'un' },
    { grupo: 'fixo', descricao: meta.maoDeObra, quantidade: 1, unidade: 'un' },
    { grupo: 'fixo', descricao: 'PARAFUSO E BUCHA PARA PERSIANA', quantidade: qtd(`[Largura]/${reg.parafuso_passo}`, largura, 0), unidade: 'un' },
  ];
}

// ---------------------------------------------------------------------------
// RN-06 — Componentes condicionais (acionamento + cor + faixa de largura/altura)
// ---------------------------------------------------------------------------
export function componentesCondicionais(
  tipo: TipoPersiana,
  cor: Cor,
  acionamento: Acionamento,
  largura: number,
  altura: number,
): ComponenteCalculado[] {
  return COND_DATA.filter((r) => {
    if (r.tipo !== tipo) return false;
    if (r.cor !== 'Todos' && r.cor !== cor) return false;
    if (r.acionamento !== 'Todos' && r.acionamento !== acionamento) return false;
    const valor = r.comparador === 'largura' ? largura : altura;
    return valor >= r.min && valor <= r.max;
  }).map((r) => ({
    grupo: 'condicional' as const,
    descricao: r.descricao,
    quantidade: qtd(r.formula, largura, altura),
    unidade: r.unidade,
  }));
}

// ---------------------------------------------------------------------------
// RN-07 — Base e Tampa (2 tampas por persiana, cor = cor_acessorio)
// ---------------------------------------------------------------------------
export function baseTampa(tipo: TipoPersiana, cor: Cor, largura: number): ComponenteCalculado[] {
  const meta = META[tipo];
  const corUp = COR_UPPER[cor];
  const reg = getRegras().persiana;

  // Double Vision usa componentes próprios; demais usam BASE CÔNICA.
  const ehDoubleVision = tipo === 'persiana_rolo_double_vision';
  const nomeBase = ehDoubleVision
    ? `BASE DOUBLE VISION COR ${corUp}`
    : `BASE CONICA COR ${corUp}`;
  const nomeTampa = ehDoubleVision
    ? `TAMPA DA BASE DOUBLE VISION COR ${corUp}`
    : `TAMPA DA BASE CONICA COR ${corUp}`;

  // Fórmula da base: rolo e DV descontam (parametrizável); romana usa [Largura].
  const formulaBase = meta.familia === 'romana' ? '[Largura]' : `[Largura]-${reg.base_desconto_rolo}`;

  return [
    { grupo: 'base', descricao: nomeBase, quantidade: qtd(formulaBase, largura, 0), unidade: 'm' },
    { grupo: 'base', descricao: nomeTampa, quantidade: reg.tampas_por_persiana, unidade: 'un' },
  ];
}

/** Todos os componentes (fixos + condicionais + base/tampa) para o breakdown/OS. */
export function todosComponentes(
  tipo: TipoPersiana,
  cor: Cor,
  acionamento: Acionamento,
  largura: number,
  altura: number,
): ComponenteCalculado[] {
  return [
    ...componentesFixos(tipo, largura),
    ...componentesCondicionais(tipo, cor, acionamento, largura, altura),
    ...baseTampa(tipo, cor, largura),
  ];
}
