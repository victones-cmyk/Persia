// apps/web/src/lib/cortinaTypes.ts
// Tipos e opções da calculadora de CORTINA (Fase 7) — espelha services/calc/cortina.ts.

import type { TecidoOpcao } from './calcTypes';

export type ModeloCortina = 'ilhos' | 'prega' | 'franzido' | 'wave';
export type FixacaoCortina = 'varao' | 'trilho' | 'varao_suico';
export type ConfigTecidoCortina = 'um_tecido' | 'dois_tecidos_mesmo_varao' | 'dois_tecidos_varao_duplo';

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
  metodo: 'normal' | 'emenda';
  barra_consumo: number;
  consumo_frente: number;
  metragem_frente: number;
  metragem_tras: number | null;
  tiras_frente: number | null;
  itens: ItemCortina[];
}

export interface CalcularCortinaResposta {
  resultado: ResultadoCortina;
  tecido_frente: TecidoOpcao;
  tecido_tras: TecidoOpcao | null;
  valor_tecido: number;
}

export const MODELOS_CORTINA: { value: ModeloCortina; label: string }[] = [
  { value: 'ilhos', label: 'Ilhós' },
  { value: 'prega', label: 'Prega (Americana / Macho / Fêmea)' },
  { value: 'franzido', label: 'Franzido' },
  { value: 'wave', label: 'Wave' },
];

export const FIXACOES_CORTINA: { value: FixacaoCortina; label: string }[] = [
  { value: 'varao', label: 'Varão' },
  { value: 'trilho', label: 'Trilho' },
  { value: 'varao_suico', label: 'Varão suíço' },
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
