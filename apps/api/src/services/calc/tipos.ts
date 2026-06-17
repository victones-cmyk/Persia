// apps/api/src/services/calc/tipos.ts
// Tipos e metadados do motor de cálculo de persiana (RN-02, RN-03, RN-07).

export type TipoPersiana =
  | 'persiana_rolo_blackout'
  | 'persiana_rolo_screen'
  | 'persiana_rolo_translucido'
  | 'persiana_rolo_double_vision'
  | 'persiana_romana_blackout'
  | 'persiana_romana_screen'
  | 'persiana_romana_translucido';

export type Familia = 'rolo' | 'romana';
export type Cor = 'Branco' | 'Bege' | 'Cinza' | 'Preto';
export type Acionamento =
  | 'com_bando'
  | 'com_barra'
  | 'motorizado_com_bando'
  | 'motorizado_sem_bando';

export type GrupoComponente = 'fixo' | 'condicional' | 'base';

export interface MetaPersiana {
  codigoGc: string;
  familia: Familia;
  /** Margem somada à altura na fórmula (RN-02): rolo +0,15m, romana +0,08m. */
  margem: number;
  /** Double Vision dobra a altura antes da margem (RN-02). */
  dobrarAltura: boolean;
  /** Base da fórmula de VENDA: [Dimensao] (rolo cheio) ou [Largura] (Screen). */
  baseVenda: 'dimensao' | 'largura';
  /** Fator de desperdício/multiplicador na fórmula de venda (RN-02). */
  fatorVenda: number;
  /** Descrição da mão de obra (varia por código no DecorSoft, aba 06). */
  maoDeObra: string;
}

// Metadados por tipo — extraídos de base_3 (abas 04, 05, 06, 13) e RN-02.
export const META: Record<TipoPersiana, MetaPersiana> = {
  persiana_rolo_blackout: {
    codigoGc: '2591', familia: 'rolo', margem: 0.15, dobrarAltura: false,
    baseVenda: 'dimensao', fatorVenda: 1, maoDeObra: 'MÃO DE OBRA PERSIANA',
  },
  persiana_rolo_screen: {
    codigoGc: '2592', familia: 'rolo', margem: 0.15, dobrarAltura: false,
    baseVenda: 'largura', fatorVenda: 1.3, maoDeObra: 'MÃO DE OBRA PERSIANA',
  },
  persiana_rolo_translucido: {
    codigoGc: '2608', familia: 'rolo', margem: 0.15, dobrarAltura: false,
    // 2608 usa "MÃO DE OBRA PERSIANA ROMANA" no DecorSoft (aba 06).
    baseVenda: 'dimensao', fatorVenda: 1, maoDeObra: 'MÃO DE OBRA PERSIANA ROMANA',
  },
  persiana_rolo_double_vision: {
    codigoGc: '2606', familia: 'rolo', margem: 0.15, dobrarAltura: true,
    baseVenda: 'dimensao', fatorVenda: 1, maoDeObra: 'MÃO DE OBRA PERSIANA',
  },
  persiana_romana_blackout: {
    codigoGc: '2611', familia: 'romana', margem: 0.08, dobrarAltura: false,
    baseVenda: 'dimensao', fatorVenda: 1.3, maoDeObra: 'MÃO DE OBRA PERSIANA ROMANA',
  },
  persiana_romana_screen: {
    codigoGc: '2612', familia: 'romana', margem: 0.08, dobrarAltura: false,
    baseVenda: 'largura', fatorVenda: 1.2, maoDeObra: 'MÃO DE OBRA PERSIANA ROMANA',
  },
  persiana_romana_translucido: {
    codigoGc: '2601', familia: 'romana', margem: 0.08, dobrarAltura: false,
    baseVenda: 'dimensao', fatorVenda: 1.2, maoDeObra: 'MÃO DE OBRA PERSIANA ROMANA',
  },
};

export const TIPOS_PERSIANA = Object.keys(META) as TipoPersiana[];

export const TIPO_LABEL: Record<TipoPersiana, string> = {
  persiana_rolo_blackout: 'PERSIANA ROLO BLACKOUT',
  persiana_rolo_screen: 'PERSIANA ROLO SCREEN',
  persiana_rolo_translucido: 'PERSIANA ROLO TRANSLÚCIDO',
  persiana_rolo_double_vision: 'PERSIANA DOUBLE VISION',
  persiana_romana_blackout: 'PERSIANA ROMANA BLACKOUT',
  persiana_romana_screen: 'PERSIANA ROMANA SCREEN',
  persiana_romana_translucido: 'PERSIANA ROMANA TRANSLÚCIDO',
};

export const ACIONAMENTO_LABEL: Record<Acionamento, string> = {
  com_bando: 'Com Bandô',
  com_barra: 'Com Barra Estabilizadora',
  motorizado_com_bando: 'Motorizado com Bandô',
  motorizado_sem_bando: 'Motorizado sem Bandô',
};

export function isTipoPersiana(t: string): t is TipoPersiana {
  return t in META;
}

/** % padrão do Tamanho do Comando = 75% da altura (Victor 17/06/2026; era 70%). Campo editável. */
export const TC_FATOR = 0.75;
