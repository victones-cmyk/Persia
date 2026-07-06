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
import { getRegras } from './regras';

export class NotImplementedError extends Error {
  code = 'CORTINA_NAO_IMPLEMENTADA';
  constructor(modelo = '') {
    super(`Cálculo de cortina${modelo ? ` (${modelo})` : ''} não implementado nesta fase.`);
    this.name = 'NotImplementedError';
  }
}

export type ModeloCortina = 'ilhos' | 'prega' | 'franzido' | 'wave';
export type FixacaoCortina = 'varao' | 'trilho' | 'varao_suico';
export type MetodoCortina = 'normal' | 'emenda' | 'barra_postica';
export type MetodoAlturaCortina = 'emenda' | 'barra_postica';
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
  metodo_altura?: MetodoAlturaCortina; // quando altura + consumos > largura do tecido
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
  metodo: MetodoCortina; // normal, emenda ou barra postiça
  altura_excede_tecido: boolean;
  barra_consumo: number; // m gastos na altura (folga de topo + barra)
  consumo_frente: number; // largura × franzido (largura franzida do tecido frente)
  metragem_frente: number; // m lineares de tecido frente
  metragem_tras: number | null; // m lineares do 2º tecido (forro/trás)
  tiras_frente: number | null; // nº de tiras emendadas (só no método emenda)
  barra_postica_base: number | null;
  barra_postica_acrescimo: number | null;
  itens: ItemCortina[];
}

// Folga de topo, entretela, fator do wave e passo de corte são PARAMETRIZÁVEIS
// (módulo Admin → Regras de Cálculo). Lidos de getRegras().cortina.

function arredondaParaMultiplo(n: number, mult: number): number {
  return roundHalfUp(Math.ceil(roundHalfUp(n / mult, 6)) * mult);
}
function arredondaTecido(n: number): number {
  return arredondaParaMultiplo(n, getRegras().cortina.passo_tecido);
}

/**
 * Acessórios do Wave: cordão com 1 botão a cada `passo_botao_wave` m a partir do
 * zero, arredondado p/ cima até múltiplo de 4. O TECIDO do wave NÃO sai daqui —
 * usa o fator do wave (largura × franzido_wave).
 */
function dadosWave(largura: number): { botoes: number; cordao_m: number } {
  const passo = getRegras().cortina.passo_botao_wave;
  const botoes = arredondaParaMultiplo(Math.ceil(largura / passo + 1), 4);
  const vaos = botoes - 1;
  return { botoes, cordao_m: roundHalfUp(vaos * passo) };
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
  metodo: MetodoCortina,
  aberturas: number,
): { metragem: number; tiras: number | null; barraPosticaBase: number | null; barraPosticaAcrescimo: number | null } {
  if (metodo === 'normal') return { metragem: arredondaTecido(consumo), tiras: null, barraPosticaBase: null, barraPosticaAcrescimo: null };
  if (metodo === 'barra_postica') {
    const base = arredondaTecido(consumo);
    const acrescimoBruto = base * (aberturas >= 2 ? 0.5 : 1);
    const metragem = arredondaTecido(base + acrescimoBruto);
    return { metragem, tiras: null, barraPosticaBase: base, barraPosticaAcrescimo: roundHalfUp(metragem - base) };
  }
  // Emenda: o nº de faixas = quantas larguras de tecido cobrem a largura FRANZIDA
  // (consumo ÷ largura do tecido, arredondado p/ cima). Confirmado pelo Victor (v.5.1):
  // cortina 2,00×6,00 com franzido 4× → consumo 8,00; tecido de 3,00 m → 3 faixas (8÷3),
  // NÃO 4. (Antes havia um mínimo "= franzido" que inflava.) Cada faixa = altura +
  // acabamento de topo + barra (exato). Bate também com o exemplo antigo (A4,32: franzido
  // 2 → 2 faixas = 8,64; 2,5/3 → 3 faixas = 12,96).
  const tiras = Math.ceil(consumo / larguraTecido);
  return { metragem: roundHalfUp(tiras * (altura + barraConsumo)), tiras, barraPosticaBase: null, barraPosticaAcrescimo: null };
}

/** Calcula uma cortina dos modelos Ilhós / Prega / Franzido. */
export function calcularCortina(e: EntradaCortina): ResultadoCortina {
  if (!['ilhos', 'prega', 'franzido', 'wave'].includes(e.modelo)) throw new NotImplementedError(e.modelo);
  if (!(e.largura > 0) || !(e.altura > 0) || !(e.largura_tecido > 0)) {
    throw new Error('Largura, altura e largura do tecido devem ser positivas.');
  }

  const reg = getRegras().cortina;
  const franzidoFrente = e.franzido_frente ?? reg.franzido_frente_default;
  const franzidoTras = e.franzido_tras ?? reg.franzido_tras_default;
  const tamanhoBarra = e.tamanho_barra ?? reg.tamanho_barra_default;
  const fatorBarra = (e.tipo_barra ?? reg.tipo_barra_default) === 'dupla' ? 2 : 1;
  const aberturas = e.aberturas ?? reg.aberturas_default;
  const espIlhos = e.espacamento_ilhos ?? reg.espacamento_ilhos_default;
  const espFerragem = e.espacamento_ferragem ?? reg.espacamento_ferragem_default;
  const larguraTecidoTras = e.largura_tecido_tras ?? e.largura_tecido;
  const multParidade = aberturas >= 2 ? 4 : 2;

  const barraConsumo = roundHalfUp(reg.folga_topo[e.modelo] + tamanhoBarra * fatorBarra);
  const alturaExcedeTecido = e.altura + barraConsumo > e.largura_tecido;
  const metodo: MetodoCortina = alturaExcedeTecido ? (e.metodo_altura ?? 'emenda') : 'normal';

  // ---- Tecido frente ----
  // Wave usa fator próprio (2,7, medido pelo Victor); nos demais é largura × franzido.
  const wave = e.modelo === 'wave' ? dadosWave(e.largura) : null;
  const fatorFrente = wave ? reg.franzido_wave : franzidoFrente;
  const consumoFrente = roundHalfUp(e.largura * fatorFrente);
  const frente = metragemFace(consumoFrente, e.largura_tecido, e.altura, barraConsumo, metodo, aberturas);

  // ---- Tecido de trás / forro ----
  let metragemTras: number | null = null;
  if (e.config === 'dois_tecidos_mesmo_varao') {
    metragemTras = frente.metragem; // costurado junto → acompanha a frente
  } else if (e.config === 'dois_tecidos_varao_duplo') {
    const consumoTras = roundHalfUp(e.largura * franzidoTras);
    const alturaExcedeTecidoTras = e.altura + barraConsumo > larguraTecidoTras;
    const metodoTras: MetodoCortina = alturaExcedeTecidoTras ? (e.metodo_altura ?? 'emenda') : 'normal';
    metragemTras = metragemFace(consumoTras, larguraTecidoTras, e.altura, barraConsumo, metodoTras, aberturas).metragem;
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
    // Wave: cordão (m), rodízio wave e base click (= nº de botões). Fita wave (Victor v.4.1):
    // = a largura franzida ("franzido em cima"); na cortina sem emenda isso é a própria
    // metragem do tecido, na com emenda é o consumo franzido (não a metragem total das faixas).
    const fitaWave = metodo === 'emenda' ? consumoFrente : frente.metragem;
    itens.push({ tipo: 'acessorio', item: 'Cordão wave', quantidade: wave.cordao_m, unidade: 'm', auto: true });
    itens.push({ tipo: 'acessorio', item: 'Rodízio wave', quantidade: wave.botoes, unidade: 'un', auto: true });
    itens.push({ tipo: 'acessorio', item: 'Base click', quantidade: wave.botoes, unidade: 'un', auto: true });
    itens.push({ tipo: 'acessorio', item: 'Fita wave', quantidade: fitaWave, unidade: 'm', auto: true });
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

  // ---- Entretela (KOS): só modelos com entretela. Qtd = largura franzida (Victor v.5.1):
  // sem emenda = metragem do tecido; COM emenda = o franzido de cima (consumo), não a
  // metragem total das faixas. Mesma regra da fita wave. ----
  if (reg.tem_entretela[e.modelo]) {
    const entretelaQtd = metodo === 'emenda' ? consumoFrente : frente.metragem;
    itens.push({ tipo: 'acessorio', item: 'Entretela (KOS)', quantidade: entretelaQtd, unidade: 'm', auto: true });
  }

  // ---- Ponteiras: 2 por varão. Trilho NÃO usa ponteira. ----
  if (e.fixacao !== 'trilho') {
    itens.push({ tipo: 'acessorio', item: 'Ponteira', quantidade: 2, unidade: 'un', auto: true });
    if (varaoDuplo) itens.push({ tipo: 'acessorio', item: 'Ponteira (traseira)', quantidade: 2, unidade: 'un', auto: true });
  }

  // ---- Terminais (Victor v.4.1): em TODO trilho ou varão suíço (2 por ponta = 4),
  // qualquer modelo — não é mais exclusivo do Wave. ----
  if (e.fixacao === 'trilho' || e.fixacao === 'varao_suico') {
    itens.push({ tipo: 'acessorio', item: 'Terminais', quantidade: 4, unidade: 'un', auto: true });
  }

  return {
    modelo: e.modelo,
    fixacao: e.fixacao,
    metodo,
    altura_excede_tecido: alturaExcedeTecido,
    barra_consumo: barraConsumo,
    consumo_frente: consumoFrente,
    metragem_frente: frente.metragem,
    metragem_tras: metragemTras,
    tiras_frente: frente.tiras,
    barra_postica_base: frente.barraPosticaBase,
    barra_postica_acrescimo: frente.barraPosticaAcrescimo,
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
  modelo?: ModeloCortina; // modelo PRÓPRIO da camada (Victor v.4.1: frente wave + fundo franzido). Default = e.modelo.
  metodo_altura?: MetodoAlturaCortina;
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
  metodo: MetodoCortina;
  altura_excede_tecido: boolean;
  consumo: number; // largura franzida (m)
  metragem: number; // m lineares de tecido (cortado de 5 em 5 cm)
  tiras: number | null;
  barra_consumo: number;
  barra_postica_base: number | null;
  barra_postica_acrescimo: number | null;
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

  // Barra (fixação) com 2/3 tecidos — regras do Victor (19/06):
  //  • VARÃO / VARÃO SUÍÇO: 1 POR CAMADA, escolhido individualmente pelo vendedor
  //    (cliente pode misturar, ex. 2 finos 19mm + 1 grosso 28mm) → não agrega, vira
  //    uma linha por camada.
  //  • TRILHO: conta UMA VEZ (1 trilho duplo/triplo), NÃO soma por camada.
  const varaoPorCamada = e.fixacao === 'varao' || e.fixacao === 'varao_suico';
  const nomeBarraBase = nomeVarao(e.fixacao);
  const multiCamada = e.camadas.length > 1;

  e.camadas.forEach((cam, i) => {
    const r = calcularCortina({
      modelo: cam.modelo ?? e.modelo, // Victor v.4.1: cada camada pode ter seu próprio modelo
      fixacao: e.fixacao,
      config: 'um_tecido',
      largura: e.largura,
      altura: e.altura,
      largura_tecido: cam.largura_tecido,
      franzido_frente: cam.franzido,
      metodo_altura: cam.metodo_altura,
      tamanho_barra: e.tamanho_barra,
      tipo_barra: e.tipo_barra,
      aberturas: e.aberturas,
      espacamento_ilhos: e.espacamento_ilhos,
      espacamento_ferragem: e.espacamento_ferragem,
    });
    camadas.push({
      metodo: r.metodo,
      altura_excede_tecido: r.altura_excede_tecido,
      consumo: r.consumo_frente,
      metragem: r.metragem_frente,
      tiras: r.tiras_frente,
      barra_consumo: r.barra_consumo,
      barra_postica_base: r.barra_postica_base,
      barra_postica_acrescimo: r.barra_postica_acrescimo,
    });

    for (const it of r.itens) {
      if (it.tipo === 'tecido') continue; // tecido é por camada
      // Entretela (Victor v.4.1): entra em CADA camada cujo modelo use entretela — não
      // mais "só na frente". O motor já emite a entretela só nos modelos com entretela.
      // Barra (varão/varão suíço/trilho): regra própria, não cai na agregação normal.
      if (it.item === nomeBarraBase) {
        if (varaoPorCamada) {
          // Varão/varão suíço: linha independente por camada (nomeada quando há +1).
          const nome = multiCamada ? `${nomeBarraBase} (camada ${i + 1})` : nomeBarraBase;
          acc.set(nome, { ...it, item: nome });
        } else if (!acc.has(nomeBarraBase)) {
          // Trilho: 1 trilho duplo/triplo — conta uma vez (qty = largura), não soma.
          acc.set(nomeBarraBase, { ...it });
        }
        continue;
      }
      // Terminais no TRILHO: é 1 rail só (duplo/triplo) → conta uma vez, não soma por
      // camada. No varão suíço cada camada tem seu próprio rail, então soma (normal).
      if (it.item === 'Terminais' && e.fixacao === 'trilho') {
        if (!acc.has('Terminais')) acc.set('Terminais', { ...it });
        continue;
      }
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
