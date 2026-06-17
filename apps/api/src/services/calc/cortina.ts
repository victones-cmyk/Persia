// apps/api/src/services/calc/cortina.ts
// Motor de cálculo de CORTINA (Fase 7). Modelos: ILHÓS, PREGA (Americana = Macho
// = Fêmea), FRANZIDO e WAVE. "Argolas" do DecorSoft = FRANZIDO no varão (Victor),
// não é modelo à parte. Regras: planilha "CORTINA SOB MEDIDA_v.3" + respostas do
// Victor (12–16/06/2026) + método de emenda da Cortinas Fênix.
//
// Preços: tecido = SOB MEDIDA (por metro); acessórios = VAREJO, SAEM DO GESTÃOCLICK
// (vendedor escolhe o produto). O motor calcula QUANTIDADES + metragem de tecido;
// os preços são aplicados depois, na montagem do orçamento.
//
// Tecido vendido/cortado FRACIONADO em passos de 5 cm (Victor 16/06: "calcular de
// 5 em 5 cm para evitar erros de corte"). A metragem de tecido é arredondada p/
// cima ao múltiplo de 0,05 m em PASSO_TECIDO.

import { roundHalfUp } from './arredondamento';

export class NotImplementedError extends Error {
  code = 'CORTINA_NAO_IMPLEMENTADA';
  constructor(modelo = '') {
    super(`Cálculo de cortina${modelo ? ` (${modelo})` : ''} não implementado nesta fase.`);
    this.name = 'NotImplementedError';
  }
}

export type ModeloCortina = 'ilhos' | 'prega' | 'franzido' | 'wave';
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
  wave: 0.12, // cabeçote da entretela (12 cm)
};
const TEM_ENTRETELA: Record<ModeloCortina, boolean> = { ilhos: true, prega: true, franzido: false, wave: true };

// Fator de franzimento do WAVE. Victor (16/06): trilho 3,00 m → 8,10 m de tecido
// ⇒ 8,10 / 3,00 = 2,7. TENTATIVO: ele vai medir mais larguras p/ confirmar se o
// fator se mantém (BLOQUEANTE-05).
const FRANZIDO_WAVE = 2.7;

// Tecido cortado de 5 em 5 cm (Victor 16/06). Arredonda p/ cima ao múltiplo de 0,05 m.
const PASSO_TECIDO = 0.05;

function arredondaParaMultiplo(n: number, mult: number): number {
  return roundHalfUp(Math.ceil(roundHalfUp(n / mult, 6)) * mult);
}
function arredondaTecido(n: number): number {
  return arredondaParaMultiplo(n, PASSO_TECIDO);
}

/**
 * Acessórios do Wave (deduzido dos áudios do Victor): cordão com 1 botão a cada
 * 5 cm a partir do zero, arredondado p/ cima até múltiplo de 4. O TECIDO do wave
 * NÃO sai daqui — usa FRANZIDO_WAVE (largura × 2,7), medido pelo Victor.
 */
function dadosWave(largura: number): { botoes: number; cordao_m: number } {
  const botoes = arredondaParaMultiplo(Math.ceil(largura / 0.05 + 1), 4);
  const vaos = botoes - 1;
  return { botoes, cordao_m: roundHalfUp(vaos * 0.05) };
}

function nomeVarao(f: FixacaoCortina): string {
  return f === 'trilho' ? 'Trilho' : f === 'varao_suico' ? 'Varão suíço' : 'Varão';
}
/** Argolas no varão; rodízios/ganchos no trilho ou varão suíço. */
function nomeFerragem(f: FixacaoCortina): string {
  return f === 'varao' ? 'Argolas' : 'Rodízios/ganchos';
}

/**
 * Metragem de tecido de uma face (normal = largura×franzido; emenda = tiras
 * verticais). Cortado de 5 em 5 cm: cada corte arredonda p/ cima ao múltiplo de
 * 0,05 m (Victor 16/06). No método emenda arredonda o comprimento de CADA tira.
 */
function metragemFace(
  consumo: number,
  larguraTecido: number,
  altura: number,
  barraConsumo: number,
  metodo: 'normal' | 'emenda',
): { metragem: number; tiras: number | null } {
  if (metodo === 'normal') return { metragem: arredondaTecido(consumo), tiras: null };
  const tiras = Math.ceil(consumo / larguraTecido);
  return { metragem: roundHalfUp(tiras * arredondaTecido(altura + barraConsumo)), tiras };
}

/** Calcula uma cortina dos modelos Ilhós / Prega / Franzido. */
export function calcularCortina(e: EntradaCortina): ResultadoCortina {
  if (!['ilhos', 'prega', 'franzido', 'wave'].includes(e.modelo)) throw new NotImplementedError(e.modelo);
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
  // Wave usa fator próprio (2,7, medido pelo Victor); nos demais é largura × franzido.
  const wave = e.modelo === 'wave' ? dadosWave(e.largura) : null;
  const consumoFrente = roundHalfUp(e.largura * (wave ? FRANZIDO_WAVE : franzidoFrente));
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

  // ---- Ferragem da frente ----
  if (wave) {
    // Wave: cordão (m), rodízio wave e base click (= nº de botões), terminais (2 por ponta).
    itens.push({ tipo: 'acessorio', item: 'Cordão wave', quantidade: wave.cordao_m, unidade: 'm', auto: true });
    itens.push({ tipo: 'acessorio', item: 'Rodízio wave', quantidade: wave.botoes, unidade: 'un', auto: true });
    itens.push({ tipo: 'acessorio', item: 'Base click', quantidade: wave.botoes, unidade: 'un', auto: true });
    itens.push({ tipo: 'acessorio', item: 'Terminais', quantidade: 4, unidade: 'un', auto: true });
  } else if (e.modelo === 'ilhos') {
    // Ilhós: 1 a cada 15 cm da largura franzida. Arredonda p/ cima até par / múltiplo de 4.
    itens.push({ tipo: 'acessorio', item: 'Ilhoses', quantidade: arredondaParaMultiplo(Math.ceil(consumoFrente / espIlhos), multParidade), unidade: 'un', auto: true });
  } else {
    // Prega/Franzido: argola (varão) ou rodízio (trilho/varão suíço), 1 a cada 10 cm do varão.
    itens.push({ tipo: 'acessorio', item: nomeFerragem(e.fixacao), quantidade: arredondaParaMultiplo(Math.ceil(e.largura / espFerragem), multParidade), unidade: 'un', auto: true });
  }
  // Face de trás (varão duplo) sempre usa argola/rodízio a cada 10 cm do varão.
  if (varaoDuplo && !wave) {
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

// ---------------------------------------------------------------------------
// Cortina com N CAMADAS (modelo "+" do Victor, 17/06/2026, ver decisions §9.7)
// ---------------------------------------------------------------------------
// "tipo" simples/dupla/tripla = nº de camadas (cada camada = tecido próprio em
// varão próprio). Cada camada é calculada como uma CORTINA SIMPLES (um_tecido) e
// os ACESSÓRIOS são agregados (varão/ponteira/ferragem somam por camada; suporte
// fica manual). A ENTRETELA só conta na camada da frente (Victor). O tecido é
// tratado por camada (cada camada pode ter tecido diferente, com preço próprio).

export interface CamadaCortina {
  largura_tecido: number; // largura do rolo do tecido desta camada (m)
  franzido?: number; // default 3 (no wave, ignorado: usa 2,7)
}

export interface EntradaCortinaCompleta {
  modelo: ModeloCortina;
  fixacao: FixacaoCortina;
  largura: number;
  altura: number;
  camadas: CamadaCortina[]; // 1 = simples, 2 = dupla, 3 = tripla
  tamanho_barra?: number;
  tipo_barra?: 'simples' | 'dupla';
  aberturas?: number;
  espacamento_ilhos?: number;
  espacamento_ferragem?: number;
}

export interface CamadaResultado {
  metodo: 'normal' | 'emenda';
  consumo: number; // largura franzida (m)
  metragem: number; // m lineares de tecido (cortado de 5 em 5 cm)
  tiras: number | null;
}

export interface ResultadoCortinaCompleta {
  modelo: ModeloCortina;
  fixacao: FixacaoCortina;
  n_camadas: number;
  camadas: CamadaResultado[]; // tecido por camada (preço aplicado depois, por tecido)
  acessorios: ItemCortina[]; // quantidades agregadas (sem tecido)
}

export function calcularCortinaMultiCamada(e: EntradaCortinaCompleta): ResultadoCortinaCompleta {
  if (!e.camadas || e.camadas.length < 1 || e.camadas.length > 3) {
    throw new Error('A cortina deve ter de 1 a 3 camadas (simples/dupla/tripla).');
  }

  const camadas: CamadaResultado[] = [];
  const acc = new Map<string, ItemCortina>(); // acessórios agregados por nome

  e.camadas.forEach((cam, i) => {
    const r = calcularCortina({
      modelo: e.modelo,
      fixacao: e.fixacao,
      config: 'um_tecido',
      largura: e.largura,
      altura: e.altura,
      largura_tecido: cam.largura_tecido,
      franzido_frente: cam.franzido,
      tamanho_barra: e.tamanho_barra,
      tipo_barra: e.tipo_barra,
      aberturas: e.aberturas,
      espacamento_ilhos: e.espacamento_ilhos,
      espacamento_ferragem: e.espacamento_ferragem,
    });
    camadas.push({ metodo: r.metodo, consumo: r.consumo_frente, metragem: r.metragem_frente, tiras: r.tiras_frente });

    for (const it of r.itens) {
      if (it.tipo === 'tecido') continue; // tecido é por camada
      if (it.item === 'Entretela (KOS)' && i > 0) continue; // entretela só na frente
      const cur = acc.get(it.item);
      if (cur) cur.quantidade = roundHalfUp(cur.quantidade + it.quantidade);
      else acc.set(it.item, { ...it });
    }
  });

  return {
    modelo: e.modelo,
    fixacao: e.fixacao,
    n_camadas: e.camadas.length,
    camadas,
    acessorios: [...acc.values()],
  };
}
