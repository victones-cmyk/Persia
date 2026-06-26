// apps/api/src/services/calc/persianaPrecoGc.ts
// Ponte entre o motor de preço por componentes (persianaPreco) e o GestãoClick.
// Resolve os preços (VENDA e CUSTO, tier VAREJO) dos componentes pelo codigo_interno
// e devolve o resultado pronto para os controllers (cálculo na tela e envio ao GC).
// Centraliza o TC padrão (RN-04) e o formato do breakdown (compatível com o antigo).

import { calcularPrecoPersiana, type ResultadoPrecoPersiana } from './persianaPreco';
import { indicePrecosComponentes } from '../gc/componentesPersiana';
import { getRegras } from './regras';
import { roundHalfUp } from './arredondamento';
import type { TipoPersiana, Acionamento } from './tipos';

/** Mapas codigo_interno → preço de VENDA e de CUSTO (VAREJO) dos componentes. */
export async function mapasDePrecoComponentes(): Promise<{ precos: Map<string, number>; custos: Map<string, number> }> {
  const idx = await indicePrecosComponentes();
  const precos = new Map<string, number>();
  const custos = new Map<string, number>();
  for (const [k, v] of idx) {
    precos.set(k, v.preco);
    custos.set(k, v.custo);
  }
  return { precos, custos };
}

/** TC padrão (RN-04): usa o valor informado ou altura × tc_fator (regra parametrizável). */
export function tcPadrao(altura: number, tc?: number | null): number {
  const fator = getRegras().persiana.tc_fator;
  return tc !== undefined && tc !== null ? roundHalfUp(tc) : roundHalfUp(altura * fator);
}

export interface PrecoPersianaItem {
  /** Resultado a VAREJO (valor de venda + breakdown por componente). */
  venda: ResultadoPrecoPersiana;
  tc: number;
  valor: number; // venda (soma componentes + tecido, VAREJO)
  valor_custo: number; // custo (componentes a custo + tecido a custo)
}

/**
 * Calcula uma persiana com os preços do GestãoClick já resolvidos (passar os mapas).
 * Roda o motor duas vezes: uma com preços de VENDA, outra com preços de CUSTO.
 */
export function precoPersianaItem(args: {
  tipo: TipoPersiana;
  acionamento: Acionamento;
  largura: number;
  altura: number;
  tc?: number | null;
  preco_tecido: number;
  preco_tecido_custo?: number;
  precos: Map<string, number>;
  custos: Map<string, number>;
}): PrecoPersianaItem {
  const tc = tcPadrao(args.altura, args.tc);
  const base = { tipo: args.tipo, acionamento: args.acionamento, largura: args.largura, altura: args.altura, tc };
  const venda = calcularPrecoPersiana({ ...base, preco_tecido: args.preco_tecido, precos: args.precos });
  const custo = calcularPrecoPersiana({ ...base, preco_tecido: args.preco_tecido_custo ?? 0, precos: args.custos });
  return { venda, tc, valor: venda.valor, valor_custo: custo.valor };
}

/** Breakdown no formato antigo {grupo, descricao, quantidade, unidade} (compat com o snapshot/UI). */
export function componentesSnapshot(r: ResultadoPrecoPersiana): { grupo: string; descricao: string; quantidade: number; unidade: string }[] {
  const linhas = r.itens.map((i) => ({ grupo: 'componente', descricao: i.descricao, quantidade: i.quantidade, unidade: 'un' }));
  linhas.push({ grupo: 'tecido', descricao: 'TECIDO', quantidade: r.tecido.quantidade, unidade: 'm' });
  return linhas;
}
