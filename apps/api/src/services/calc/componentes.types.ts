// apps/api/src/services/calc/componentes.types.ts
// Tipos dos dados de componentes (fixos, condicionais, base).

import type { TipoPersiana, GrupoComponente } from './tipos';

/** Linha de regra condicional, como extraída da aba 07 do DecorSoft (RN-06). */
export interface RegraCondicionalData {
  tipo: TipoPersiana;
  materialCodigo: string;
  descricao: string;
  /** Variável comparada contra [min, max]. */
  comparador: 'largura' | 'altura';
  min: number;
  max: number;
  /** 'Todos' = aplica-se a qualquer cor de acessório. */
  cor: 'Branco' | 'Bege' | 'Cinza' | 'Preto' | 'Todos';
  /** 'Todos' = aplica-se a qualquer acionamento. */
  acionamento:
    | 'com_bando'
    | 'com_barra'
    | 'motorizado_com_bando'
    | 'motorizado_sem_bando'
    | 'Todos';
  /** Fórmula de quantidade sobre [Largura]/[Altura] (avaliada em runtime). */
  formula: string;
  unidade: string;
}

/** Item de componente calculado, exibido no breakdown e salvo em itens_orcamento. */
export interface ComponenteCalculado {
  grupo: GrupoComponente;
  descricao: string;
  quantidade: number;
  unidade: string;
}
