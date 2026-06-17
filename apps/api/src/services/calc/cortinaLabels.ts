// apps/api/src/services/calc/cortinaLabels.ts
// Rótulos de cortina usados na montagem do nome do produto no GestãoClick.

import type { ModeloCortina } from './cortina';

export const MODELOS_CORTINA_LABEL: Record<ModeloCortina, string> = {
  ilhos: 'Ilhós',
  prega: 'Prega',
  franzido: 'Franzido',
  wave: 'Wave',
};

export const TIPO_CAMADAS_LABEL: Record<number, string> = {
  1: '',
  2: 'Dupla',
  3: 'Tripla',
};
