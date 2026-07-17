// apps/web/src/lib/cortinaTypes.ts
// Tipos e opções da calculadora de CORTINA (Fase 7) — espelha services/calc/cortina.ts.

import type { TecidoOpcao } from './calcTypes';

export type ModeloCortina = 'ilhos' | 'prega' | 'franzido' | 'wave';
export type ModeloCamadaCortina = ModeloCortina | 'costurado_junto';
export type ModeloCortinaOpcao = ModeloCamadaCortina | 'prega_americana' | 'prega_macho' | 'prega_femea';
export type QuantidadeCosturadoJunto = 'mesma_quantidade' | 'proporcao_franzido';
export type FixacaoCortina = 'varao' | 'trilho' | 'varao_suico';
export type MetodoCortina = 'normal' | 'emenda' | 'barra_postica';
export type MetodoAlturaCortina = 'emenda' | 'barra_postica';
export type ConfigTecidoCortina = 'um_tecido' | 'dois_tecidos_mesmo_varao' | 'dois_tecidos_varao_duplo';
export type DescontoCortina =
  | 'teto_ao_chao'
  | 'gesso_ao_chao'
  | 'sem_desconto'
  | 'varao_ao_chao'
  | 'suporte_de_teto';

export interface ItemCortina {
  tipo: 'tecido' | 'acessorio';
  item: string;
  quantidade: number;
  unidade: 'm' | 'un';
  auto: boolean;
}

export interface ResultadoCortina {
  modelo: ModeloCortina;
  fixacao: FixacaoCortina;
  metodo: MetodoCortina;
  altura_excede_tecido: boolean;
  barra_consumo: number;
  consumo_frente: number;
  metragem_frente: number;
  bainhas_laterais_acrescimo: number;
  metragem_tras: number | null;
  tiras_frente: number | null;
  barra_postica_base: number | null;
  barra_postica_acrescimo: number | null;
  itens: ItemCortina[];
}

export interface CalcularCortinaResposta {
  resultado: ResultadoCortina;
  tecido_frente: TecidoOpcao;
  tecido_tras: TecidoOpcao | null;
  valor_tecido: number;
}

export function normalizarModeloCortina(modelo: ModeloCortinaOpcao): ModeloCortina {
  if (modelo === 'costurado_junto') return 'franzido';
  if (modelo.startsWith('prega_')) return 'prega';
  return modelo as ModeloCortina;
}

export function modeloCortinaParaOpcao(modelo: string | undefined | null): ModeloCortinaOpcao | '' {
  if (!modelo) return '';
  if (modelo === 'prega') return 'prega_americana';
  return modelo as ModeloCortinaOpcao;
}

export function modeloCortinaLabel(modelo: string): string {
  if (modelo === 'prega') return 'Prega';
  return MODELOS_CORTINA.find((m) => m.value === modelo)?.label ?? modelo;
}

export const MODELOS_CORTINA: { value: ModeloCortinaOpcao; label: string }[] = [
  { value: 'ilhos', label: 'Ilhós' },
  { value: 'prega_americana', label: 'Modelo Prega Americana' },
  { value: 'prega_macho', label: 'Modelo Prega Macho' },
  { value: 'prega_femea', label: 'Modelo Prega Fêmea' },
  { value: 'franzido', label: 'Franzido' },
  { value: 'wave', label: 'Wave' },
];

export const MODELOS_CAMADA_SECUNDARIA: { value: ModeloCortinaOpcao; label: string }[] = [
  ...MODELOS_CORTINA,
  { value: 'costurado_junto', label: 'Costurado junto' },
];

export const MODELOS_CORTINA_CALC: { value: ModeloCortina; label: string }[] = [
  { value: 'ilhos', label: 'Ilhós' },
  { value: 'prega', label: 'Prega' },
  { value: 'franzido', label: 'Franzido' },
  { value: 'wave', label: 'Wave' },
];

export const FIXACOES_CORTINA: { value: FixacaoCortina; label: string }[] = [
  { value: 'varao', label: 'Varão' },
  { value: 'trilho', label: 'Trilho' },
  { value: 'varao_suico', label: 'Varão suíço' },
];

export const DESCONTOS_CORTINA: { value: DescontoCortina; label: string; fixacoes?: FixacaoCortina[] }[] = [
  { value: 'teto_ao_chao', label: 'Teto ao chão' },
  { value: 'gesso_ao_chao', label: 'Gesso ao chão' },
  { value: 'sem_desconto', label: 'Sem desconto' },
  { value: 'varao_ao_chao', label: 'Varão ao chão', fixacoes: ['varao', 'varao_suico'] },
  { value: 'suporte_de_teto', label: 'Suporte de teto', fixacoes: ['varao', 'varao_suico'] },
];

export const CONFIGS_CORTINA: { value: ConfigTecidoCortina; label: string }[] = [
  { value: 'um_tecido', label: '1 tecido' },
  { value: 'dois_tecidos_mesmo_varao', label: '2 tecidos — forro (mesmo varão)' },
  { value: 'dois_tecidos_varao_duplo', label: '2 tecidos — varão duplo' },
];

/** Fixações permitidas por modelo (Ilhós só varão; Wave só trilho/varão suíço). */
export const FIXACOES_POR_MODELO: Record<ModeloCortina, FixacaoCortina[]> = {
  ilhos: ['varao'],
  prega: ['varao', 'trilho', 'varao_suico'],
  franzido: ['varao', 'trilho', 'varao_suico'],
  wave: ['trilho', 'varao_suico'],
};

// --- Cortina multi-camada (modelo "+" do Victor) ---

export type CategoriaAcessorio =
  | 'varao' | 'varao_suico' | 'trilho' | 'suporte_varao' | 'suporte_varao_suico'
  | 'ilhos' | 'argola' | 'rodizio' | 'ponteira' | 'terminal' | 'entretela' | 'wave';

export interface AcessorioOpcao { id: string; nome: string; preco: number; }
export interface ServicoInstalacao { id: string; nome: string; valor: number; }

/** Resposta de GET /api/calcular/cortina/acessorios. */
export interface AcessoriosCortinaResp {
  acessorios: Record<CategoriaAcessorio, AcessorioOpcao[]>;
  instalacoes: ServicoInstalacao[];
}

/** Tipo (nº de camadas) — rótulo derivado da quantidade de tecidos. */
export const TIPO_POR_CAMADAS: Record<number, string> = { 1: 'Simples', 2: 'Dupla', 3: 'Tripla' };

export interface CamadaCalc {
  tecido: TecidoOpcao;
  metodo: MetodoCortina;
  altura_excede_tecido: boolean;
  metragem: number;
  valor_tecido: number;
  tiras: number | null;
  barra_consumo: number;
  consumo: number;
  barra_postica_base: number | null;
  barra_postica_acrescimo: number | null;
  bainhas_laterais_acrescimo: number;
  costurado_junto?: boolean;
  costurado_quantidade?: QuantidadeCosturadoJunto;
}
export interface AcessorioCalc {
  item: string;
  categoria: CategoriaAcessorio | null;
  quantidade: number;
  unidade: 'm' | 'un';
  auto: boolean;
  // Wave (Victor v.4.1): itens obrigatórios com produto resolvido pelo servidor — o
  // vendedor não escolhe; a tela só exibe o produto/preço.
  auto_produto?: boolean;
  produto_id?: string;
  produto_nome?: string;
  preco?: number;
}
/** Resposta de POST /api/calcular/cortina/completa. */
export interface CalcCortinaCompletaResp {
  modelo: ModeloCortina;
  fixacao: FixacaoCortina;
  n_camadas: number;
  camadas: CamadaCalc[];
  acessorios: AcessorioCalc[];
  valor_tecido_total: number;
}
