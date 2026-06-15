// apps/api/src/services/calc/cortina.ts
// Motor de cálculo de CORTINA — modelo ILHÓS / VARÃO (Fase 7, 1º modelo).
// Regras confirmadas com Victor (12–15/06/2026) + método de emenda da Cortinas Fênix.
// Demais modelos (Wave, Prega Macho, Trilho…) virão depois — ainda BLOQUEANTE-02.
//
// Preços: tecido = SOB MEDIDA (por metro); acessórios = VAREJO e SAEM DO GESTÃOCLICK
// (o vendedor escolhe o produto). Por isso este motor calcula QUANTIDADES e a metragem
// de tecido — os preços dos acessórios são aplicados depois, na montagem do orçamento.

import { roundHalfUp } from './arredondamento';

/** Erro para modelos de cortina ainda não implementados. */
export class NotImplementedError extends Error {
  code = 'CORTINA_NAO_IMPLEMENTADA';
  constructor(modelo = '') {
    super(
      `Cálculo de cortina${modelo ? ` (${modelo})` : ''} não implementado. ` +
        'Apenas o modelo Ilhós/Varão está disponível nesta fase.',
    );
    this.name = 'NotImplementedError';
  }
}

/** Configuração de tecidos do varão (espelha os 3 cenários da planilha do Victor). */
export type ConfigTecidoCortina =
  | 'um_tecido' //               1 tecido (varão simples)
  | 'dois_tecidos_mesmo_varao' // frente + forro costurados juntos, mesmo varão
  | 'dois_tecidos_varao_duplo'; // frente + trás em varões separados

export interface EntradaCortinaIlhos {
  largura: number; // largura da parede/janela (m)
  altura: number; // altura da parede/janela (m)
  largura_tecido: number; // largura do rolo do tecido frente (m) — campo "LARGURA" do GC
  config: ConfigTecidoCortina;
  franzido_frente?: number; // default 3 (editável)
  franzido_tras?: number; // default 2 (editável) — usado no 2º tecido em varão separado
  tamanho_barra?: number; // m, default 0,10 (10 cm)
  tipo_barra?: 'simples' | 'dupla'; // default 'dupla' (fator 1 ou 2)
  aberturas?: number; // default 1 (central). 0 → ilhós par; ≥2 → múltiplo de 4
  espacamento_ilhos?: number; // m entre ilhoses, default 0,15
  largura_tecido_tras?: number; // largura do rolo do 2º tecido, se diferente
}

export interface ItemCortina {
  tipo: 'tecido' | 'acessorio';
  item: string;
  quantidade: number;
  unidade: 'm' | 'un';
  /** false = sugerido pelo cálculo mas o vendedor ajusta/escolhe o produto no GC. */
  auto: boolean;
}

export interface ResultadoCortinaIlhos {
  modelo: 'ilhos';
  metodo: 'normal' | 'emenda'; // emenda = altura da cortina maior que a largura do tecido
  barra_consumo: number; // m gastos na altura com barra + folga de ilhós
  consumo_frente: number; // largura × franzido (largura franzida do tecido frente)
  metragem_frente: number; // m lineares de tecido frente a comprar
  metragem_tras: number | null; // m lineares do 2º tecido (forro/trás), se houver
  tiras_frente: number | null; // nº de tiras emendadas (só no método emenda)
  ilhoses: number;
  itens: ItemCortina[];
}

const FOLGA_ILHOS = 0.1; // m gastos na cortina de ilhós (planilha Victor)

function arredondaParaMultiplo(n: number, mult: number): number {
  return Math.ceil(n / mult) * mult;
}

/**
 * Metragem linear de tecido para uma "face" da cortina.
 *  • método normal: largura × franzido (o tecido roda deitado; sua largura vira a altura).
 *  • método emenda (altura + barra > largura do tecido): emenda tiras verticais —
 *    nº de tiras = ceil(consumo / largura_tecido); cada tira = altura + barra.
 */
function metragemFace(
  consumo: number,
  larguraTecido: number,
  altura: number,
  barraConsumo: number,
  metodo: 'normal' | 'emenda',
): { metragem: number; tiras: number | null } {
  if (metodo === 'normal') {
    return { metragem: roundHalfUp(consumo), tiras: null };
  }
  const tiras = Math.ceil(consumo / larguraTecido);
  return { metragem: roundHalfUp(tiras * (altura + barraConsumo)), tiras };
}

/** Calcula uma cortina do modelo ILHÓS/VARÃO. */
export function calcularCortinaIlhos(e: EntradaCortinaIlhos): ResultadoCortinaIlhos {
  if (!(e.largura > 0) || !(e.altura > 0) || !(e.largura_tecido > 0)) {
    throw new Error('Largura, altura e largura do tecido devem ser positivas.');
  }

  const franzidoFrente = e.franzido_frente ?? 3;
  const franzidoTras = e.franzido_tras ?? 2;
  const tamanhoBarra = e.tamanho_barra ?? 0.1;
  const fatorBarra = (e.tipo_barra ?? 'dupla') === 'dupla' ? 2 : 1;
  const aberturas = e.aberturas ?? 1;
  const espacamento = e.espacamento_ilhos ?? 0.15;
  const larguraTecidoTras = e.largura_tecido_tras ?? e.largura_tecido;

  // Altura consumida com folga de ilhós + barra (simples ×1 / dupla ×2).
  const barraConsumo = roundHalfUp(FOLGA_ILHOS + tamanhoBarra * fatorBarra);

  // Método: normal enquanto a altura (com barra) couber na largura do tecido.
  const metodo: 'normal' | 'emenda' = e.altura + barraConsumo <= e.largura_tecido ? 'normal' : 'emenda';

  // ---- Tecido frente ----
  const consumoFrente = roundHalfUp(e.largura * franzidoFrente);
  const frente = metragemFace(consumoFrente, e.largura_tecido, e.altura, barraConsumo, metodo);

  // ---- Tecido de trás / forro ----
  let metragemTras: number | null = null;
  let tirasTras: number | null = null;
  if (e.config === 'dois_tecidos_mesmo_varao') {
    // Costurado junto no mesmo varão → mesma metragem da frente.
    metragemTras = frente.metragem;
  } else if (e.config === 'dois_tecidos_varao_duplo') {
    const consumoTras = roundHalfUp(e.largura * franzidoTras);
    const metodoTras: 'normal' | 'emenda' = e.altura + barraConsumo <= larguraTecidoTras ? 'normal' : 'emenda';
    const tras = metragemFace(consumoTras, larguraTecidoTras, e.altura, barraConsumo, metodoTras);
    metragemTras = tras.metragem;
    tirasTras = tras.tiras;
  }

  // ---- Ilhoses: 1 a cada ~0,15 m da largura franzida; arredonda P/ CIMA até par (sem
  // abertura) ou múltiplo de 4 (mais de uma abertura). Regra Victor: sempre p/ cima. ----
  const ilhosBase = Math.ceil(consumoFrente / espacamento);
  const ilhoses = arredondaParaMultiplo(ilhosBase, aberturas >= 2 ? 4 : 2);

  // ---- Acessórios (quantidades; preços vêm do GestãoClick) ----
  const itens: ItemCortina[] = [];
  const varaoDuplo = e.config === 'dois_tecidos_varao_duplo';

  // Tecidos
  itens.push({ tipo: 'tecido', item: 'Tecido (frente)', quantidade: frente.metragem, unidade: 'm', auto: true });
  if (metragemTras !== null) {
    itens.push({ tipo: 'tecido', item: varaoDuplo ? 'Tecido (trás)' : 'Tecido (forro)', quantidade: metragemTras, unidade: 'm', auto: true });
  }

  // Varão (1 por face de varão; comprimento = largura). Varão duplo = 2 varões.
  itens.push({ tipo: 'acessorio', item: 'Varão', quantidade: roundHalfUp(e.largura), unidade: 'm', auto: true });
  if (varaoDuplo) itens.push({ tipo: 'acessorio', item: 'Varão (traseiro)', quantidade: roundHalfUp(e.largura), unidade: 'm', auto: true });

  // Suportes: regra depende de varão suíço/abertura; por ora ENTRADA MANUAL (Victor).
  itens.push({ tipo: 'acessorio', item: varaoDuplo ? 'Suporte duplo' : 'Suporte', quantidade: 0, unidade: 'un', auto: false });

  // Ilhoses
  itens.push({ tipo: 'acessorio', item: 'Ilhoses', quantidade: ilhoses, unidade: 'un', auto: true });

  // Argolas: só no varão duplo (tecido de trás) — 1 a cada 10 cm de varão.
  if (varaoDuplo) {
    itens.push({ tipo: 'acessorio', item: 'Argolas', quantidade: Math.ceil(e.largura / 0.1), unidade: 'un', auto: true });
  }

  // Ponteiras: 2 por varão.
  itens.push({ tipo: 'acessorio', item: varaoDuplo ? 'Ponteira (frente)' : 'Ponteira', quantidade: 2, unidade: 'un', auto: true });
  if (varaoDuplo) itens.push({ tipo: 'acessorio', item: 'Ponteira (trás)', quantidade: 2, unidade: 'un', auto: true });

  return {
    modelo: 'ilhos',
    metodo,
    barra_consumo: barraConsumo,
    consumo_frente: consumoFrente,
    metragem_frente: frente.metragem,
    metragem_tras: metragemTras,
    tiras_frente: frente.tiras,
    ilhoses,
    itens,
  };
}

/** Dispatcher legado: só Ilhós por enquanto; demais modelos lançam NotImplementedError. */
export function calcularCortina(): never {
  throw new NotImplementedError();
}
