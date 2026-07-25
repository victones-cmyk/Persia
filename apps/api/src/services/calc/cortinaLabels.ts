// apps/api/src/services/calc/cortinaLabels.ts
// Rótulos de cortina usados na montagem do nome do produto no GestãoClick.

import type { ModeloCortina, ModeloPregaVariante } from './cortina';

export const MODELOS_CORTINA_LABEL: Record<ModeloCortina, string> = {
  ilhos: 'Ilhós',
  prega: 'Prega',
  franzido: 'Franzido',
  wave: 'Wave',
};

/** Variantes de prega: mesmo cálculo, nome próprio na ficha do produto. */
export const MODELOS_PREGA_VARIANTE_LABEL: Record<ModeloPregaVariante, string> = {
  prega_americana: 'Prega Americana',
  prega_macho: 'Prega Macho',
  prega_femea: 'Prega Fêmea',
};

export const TIPO_CAMADAS_LABEL: Record<number, string> = {
  1: '',
  2: 'Dupla',
  3: 'Tripla',
};
