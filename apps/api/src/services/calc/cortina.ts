// apps/api/src/services/calc/cortina.ts
// Motor de cálculo de CORTINA (Fase 7). Modelos prontos: ILHÓS, PREGA
// (Americana = Macho = Fêmea) e FRANZIDO. WAVE pendente (falta a fórmula da
// fita wave). Regras: planilha "CORTINA SOB MEDIDA_v.3" + respostas do Victor
// (12–15/06/2026) + método de emenda da Cortinas Fênix.
//
// Preços: tecido = SOB MEDIDA (por metro); acessórios = VAREJO, SAEM DO GESTÃOCLICK
// (vendedor escolhe o produto). O motor calcula QUANTIDADES + metragem de tecido;
// os preços são aplicados depois, na montagem do orçamento.

import { roundHalfUp } from './arredondamento';

export class NotImplementedError extends Error {
  code = 'CORTINA_NAO_IMPLEMENTADA';
  constructor(modelo = '') {
    super(`Cálculo de cortina${modelo ? ` (${modelo})` : ''} não implementado nesta fase.`);
    this.name = 'NotImplementedError';
  }
}

export type ModeloCortina = 'ilhos' | 'prega' | 'franzido';
export type FixacaoCortina = 'varao' | 'trilho' | 'varao_suico';
export type ConfigTecidoCortina =
  | 'um_tecido'
  | 'dois_tecidos_mesmo_varao' //  frente + forro costurados juntos, mesmo varão
  | 'dois_tecidos_varao_duplo'; // frente + trás em varões/canaletas separados

export interface EntradaCortina {
  modelo: ModeloCortina;
  fixacao: FixacaoCortina;
  config: ConfigTecidoCortina;
  largura: number; // parede/janela (m)
  altura: number; // parede/janela (m)
  largura_tecido: number; // largura do rolo do tecido frente (m) — campo "LARGURA" do GC
  franzido_frente?: number; // default 3 (editável)
  franzido_tras?: number; // default 2 (editável)
  tamanho_barra?: number; // m, default 0,10
  tipo_barra?: 'simples' | 'dupla'; // default 'dupla' (fator 1 ou 2)
  aberturas?: number; // default 1. 0–1 → ferragem par; ≥2 → múltiplo de 4
  espacamento_ilhos?: number; // m, default 0,15 (ilhós, sobre a largura franzida)
  espacamento_ferragem?: number; // m, default 0,10 (argola/rodízio, sobre o varão)
  largura_tecido_tras?: number; // largura do rolo do 2º tecido, se diferente
}

export interface ItemCortina {
  tipo: 'tecido' | 'acessorio';
  item: string;
  quantidade: number;
  unidade: 'm' | 'un';
  auto: boolean; // false = sugerido, mas o vendedor ajusta/escolhe (ex.: suporte)
}

export interface ResultadoCortina {
  modelo: ModeloCortina;
  fixacao: FixacaoCortina;
  metodo: 'normal' | 'emenda'; // emenda = altura da cortina > largura do tecido
  barra_consumo: number; // m gastos na altura (folga de topo + barra)
  consumo_frente: number; // largura × franzido (largura franzida do tecido frente)
  metragem_frente: number; // m lineares de tecido frente
  metragem_tras: number | null; // m lineares do 2º tecido (forro/trás)
  tiras_frente: number | null; // nº de tiras emendadas (só no método emenda)
  itens: ItemCortina[];
}

// Folga de topo (altura) por modelo — planilha v.3 / respostas do Victor.
const FOLGA_TOPO: Record<ModeloCortina, number> = {
  ilhos: 0.1, // "10 cm gastos na cortina de ilhós"
  prega: 0.12, // cabeçote da entretela (12 cm)
  franzido: 0.08, // sem entretela: ~8 cm de acabamento
};
const TEM_ENTRETELA: Record<ModeloCortina, boolean> = { ilhos: true, prega: true, franzido: false };

function arredondaParaMultiplo(n: number, mult: number): number {
  return Math.ceil(n / mult) * mult;
}

function nomeVarao(f: FixacaoCortina): string {
  return f === 'trilho' ? 'Trilho' : f === 'varao_suico' ? 'Varão suíço' : 'Varão';
}
/** Argolas no varão; rodízios/ganchos no trilho ou varão suíço. */
function nomeFerragem(f: FixacaoCortina): string {
  return f === 'varao' ? 'Argolas' : 'Rodízios/ganchos';
}

/** Metragem de tecido de uma face (normal = largura×franzido; emenda = tiras verticais). */
function metragemFace(
  consumo: number,
  larguraTecido: number,
  altura: number,
  barraConsumo: number,
  metodo: 'normal' | 'emenda',
): { metragem: number; tiras: number | null } {
  if (metodo === 'normal') return { metragem: roundHalfUp(consumo), tiras: null };
  const tiras = Math.ceil(consumo / larguraTecido);
  return { metragem: roundHalfUp(tiras * (altura + barraConsumo)), tiras };
}

/** Calcula uma cortina dos modelos Ilhós / Prega / Franzido. */
export function calcularCortina(e: EntradaCortina): ResultadoCortina {
  if (!['ilhos', 'prega', 'franzido'].includes(e.modelo)) throw new NotImplementedError(e.modelo);
  if (!(e.largura > 0) || !(e.altura > 0) || !(e.largura_tecido > 0)) {
    throw new Error('Largura, altura e largura do tecido devem ser positivas.');
  }

  const franzidoFrente = e.franzido_frente ?? 3;
  const franzidoTras = e.franzido_tras ?? 2;
  const tamanhoBarra = e.tamanho_barra ?? 0.1;
  const fatorBarra = (e.tipo_barra ?? 'dupla') === 'dupla' ? 2 : 1;
  const aberturas = e.aberturas ?? 1;
  const espIlhos = e.espacamento_ilhos ?? 0.15;
  const espFerragem = e.espacamento_ferragem ?? 0.1;
  const larguraTecidoTras = e.largura_tecido_tras ?? e.largura_tecido;
  const multParidade = aberturas >= 2 ? 4 : 2;

  const barraConsumo = roundHalfUp(FOLGA_TOPO[e.modelo] + tamanhoBarra * fatorBarra);
  const metodo: 'normal' | 'emenda' = e.altura + barraConsumo <= e.largura_tecido ? 'normal' : 'emenda';

  // ---- Tecido frente ----
  const consumoFrente = roundHalfUp(e.largura * franzidoFrente);
  const frente = metragemFace(consumoFrente, e.largura_tecido, e.altura, barraConsumo, metodo);

  // ---- Tecido de trás / forro ----
  let metragemTras: number | null = null;
  if (e.config === 'dois_tecidos_mesmo_varao') {
    metragemTras = frente.metragem; // costurado junto → acompanha a frente
  } else if (e.config === 'dois_tecidos_varao_duplo') {
    const consumoTras = roundHalfUp(e.largura * franzidoTras);
    const metodoTras: 'normal' | 'emenda' = e.altura + barraConsumo <= larguraTecidoTras ? 'normal' : 'emenda';
    metragemTras = metragemFace(consumoTras, larguraTecidoTras, e.altura, barraConsumo, metodoTras).metragem;
  }

  const varaoDuplo = e.config === 'dois_tecidos_varao_duplo';
  const itens: ItemCortina[] = [];

  // ---- Tecidos ----
  itens.push({ tipo: 'tecido', item: 'Tecido (frente)', quantidade: frente.metragem, unidade: 'm', auto: true });
  if (metragemTras !== null) {
    itens.push({ tipo: 'tecido', item: varaoDuplo ? 'Tecido (trás)' : 'Tecido (forro)', quantidade: metragemTras, unidade: 'm', auto: true });
  }

  // ---- Varão / trilho (1 por face de varão) ----
  itens.push({ tipo: 'acessorio', item: nomeVarao(e.fixacao), quantidade: roundHalfUp(e.largura), unidade: 'm', auto: true });
  if (varaoDuplo) itens.push({ tipo: 'acessorio', item: `${nomeVarao(e.fixacao)} (traseiro)`, quantidade: roundHalfUp(e.largura), unidade: 'm', auto: true });

  // ---- Suporte: ENTRADA MANUAL (Victor) ----
  itens.push({ tipo: 'acessorio', item: varaoDuplo ? 'Suporte duplo' : 'Suporte', quantidade: 0, unidade: 'un', auto: false });

  // ---- Ferragem da frente: ilhós (a cada 15 cm da largura franzida) ou argola/rodízio
  //      (a cada 10 cm do varão). Sempre arredonda P/ CIMA até par / múltiplo de 4. ----
  if (e.modelo === 'ilhos') {
    itens.push({ tipo: 'acessorio', item: 'Ilhoses', quantidade: arredondaParaMultiplo(Math.ceil(consumoFrente / espIlhos), multParidade), unidade: 'un', auto: true });
  } else {
    itens.push({ tipo: 'acessorio', item: nomeFerragem(e.fixacao), quantidade: arredondaParaMultiplo(Math.ceil(e.largura / espFerragem), multParidade), unidade: 'un', auto: true });
  }
  // Face de trás (varão duplo) sempre usa argola/rodízio a cada 10 cm do varão.
  if (varaoDuplo) {
    itens.push({ tipo: 'acessorio', item: `${nomeFerragem(e.fixacao)} (traseiro)`, quantidade: arredondaParaMultiplo(Math.ceil(e.largura / espFerragem), multParidade), unidade: 'un', auto: true });
  }

  // ---- Entretela (KOS): só modelos com entretela; qtd = metragem do tecido frente ----
  if (TEM_ENTRETELA[e.modelo]) {
    itens.push({ tipo: 'acessorio', item: 'Entretela (KOS)', quantidade: frente.metragem, unidade: 'm', auto: true });
  }

  // ---- Ponteiras: 2 por varão. Trilho NÃO usa ponteira. ----
  if (e.fixacao !== 'trilho') {
    itens.push({ tipo: 'acessorio', item: 'Ponteira', quantidade: 2, unidade: 'un', auto: true });
    if (varaoDuplo) itens.push({ tipo: 'acessorio', item: 'Ponteira (traseira)', quantidade: 2, unidade: 'un', auto: true });
  }

  return {
    modelo: e.modelo,
    fixacao: e.fixacao,
    metodo,
    barra_consumo: barraConsumo,
    consumo_frente: consumoFrente,
    metragem_frente: frente.metragem,
    metragem_tras: metragemTras,
    tiras_frente: frente.tiras,
    itens,
  };
}
