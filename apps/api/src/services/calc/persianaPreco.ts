// apps/api/src/services/calc/persianaPreco.ts
// Preço da persiana pelo modelo do Victor (v.5.1): valor = soma de TODOS os componentes
// + tecido, tudo a VAREJO (sem markup). Cada componente: quantidade pela fórmula da
// receita × preço do GestãoClick (pelo codigo_interno). Tecido: fórmula da família.
// Função PURA (preços injetados) para ser testável sem o GestãoClick.

import { evalQuantidade } from './formula';
import { roundHalfUp } from './arredondamento';
import { RECEITAS_PERSIANA, type FamiliaPersiana, type VariantePersiana } from './persianaReceitas.data';
import type { TipoPersiana, Acionamento } from './tipos';

/** Família (receita) a partir do tipo de persiana. */
export function familiaDoTipo(tipo: TipoPersiana): FamiliaPersiana {
  if (tipo === 'persiana_rolo_double_vision') return 'double_vision';
  if (tipo === 'persiana_rolo_screen') return 'tela_solar';
  if (tipo.startsWith('persiana_romana')) return 'romana';
  return 'rolo_bk_translucido'; // blackout + translúcido (mesma receita)
}

/** Variante (manual/motor × com/sem bandô) a partir do acionamento. */
export function varianteDoAcionamento(ac: Acionamento): VariantePersiana {
  switch (ac) {
    case 'com_bando': return 'com_bando';
    case 'motorizado_com_bando': return 'motor_com_bando';
    case 'motorizado_sem_bando': return 'motor_sem_bando';
    default: return 'sem_bando'; // com_barra
  }
}

export function ehAcionamentoMotorizado(ac: Acionamento): boolean {
  return ac === 'motorizado_com_bando' || ac === 'motorizado_sem_bando';
}

/** Receita ainda não cadastrada (romana ou motorizado, aguardando Victor). */
export class ReceitaPendenteError extends Error {
  code = 'RECEITA_PERSIANA_PENDENTE';
  constructor(msg: string) {
    super(msg);
    this.name = 'ReceitaPendenteError';
  }
}

export interface LinhaCustoPersiana {
  codigo_interno: string;
  descricao: string;
  quantidade: number;
  preco: number;
  subtotal: number;
}
export interface ResultadoPrecoPersiana {
  familia: FamiliaPersiana;
  variante: VariantePersiana;
  itens: LinhaCustoPersiana[];
  tecido: LinhaCustoPersiana;
  valor: number; // soma de tudo, a VAREJO
}

export interface EntradaPrecoPersiana {
  tipo: TipoPersiana;
  acionamento: Acionamento;
  largura: number;
  altura: number;
  tc: number;
  preco_tecido: number; // R$ por unidade conforme a fórmula da família (altura ou m²)
  precos: Map<string, number>; // codigo_interno → preço VAREJO do componente
}

export function calcularPrecoPersiana(e: EntradaPrecoPersiana): ResultadoPrecoPersiana {
  const familia = familiaDoTipo(e.tipo);
  const variante = varianteDoAcionamento(e.acionamento);

  if (familia === 'romana') {
    throw new ReceitaPendenteError('A regra de cálculo da persiana romana ainda não foi cadastrada.');
  }
  const receita = RECEITAS_PERSIANA[familia]?.[variante];
  if (!receita) {
    // tela_solar motorizada ainda não veio nas planilhas do Victor.
    const msg = ehAcionamentoMotorizado(e.acionamento)
      ? `A persiana motorizada de ${familia} ainda não foi cadastrada.`
      : `Receita não encontrada: ${familia}/${variante}.`;
    throw new ReceitaPendenteError(msg);
  }

  const vars = { largura: e.largura, altura: e.altura, tc: e.tc };
  let total = 0;
  const itens: LinhaCustoPersiana[] = receita.componentes.map((c) => {
    const q = evalQuantidade(c.qtd, vars);
    const preco = e.precos.get(c.codigo_interno) ?? 0;
    total += q * preco;
    return { codigo_interno: c.codigo_interno, descricao: c.descricao, quantidade: roundHalfUp(q, 4), preco, subtotal: roundHalfUp(q * preco) };
  });

  const qTec = evalQuantidade(receita.tecido_qtd, vars);
  total += qTec * e.preco_tecido;
  const tecido: LinhaCustoPersiana = {
    codigo_interno: '',
    descricao: 'TECIDO',
    quantidade: roundHalfUp(qTec, 4),
    preco: e.preco_tecido,
    subtotal: roundHalfUp(qTec * e.preco_tecido),
  };

  return { familia, variante, itens, tecido, valor: roundHalfUp(total) };
}
