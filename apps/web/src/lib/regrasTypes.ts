// apps/web/src/lib/regrasTypes.ts
// Espelha RegrasCalculo do backend (services/calc/regras.ts).

import type { TipoPersiana } from './calcTypes';
import type { ModeloCortina } from './cortinaTypes';

export interface RegraTipoPersiana {
  margem: number;
  fator_venda: number;
  base_venda: 'dimensao' | 'largura';
  dobrar_altura: boolean;
}

export interface RegrasCalculo {
  persiana: {
    tc_fator: number;
    fita_dupla_desconto_rolo: number;
    fita_colante_desconto_rolo: number;
    base_desconto_rolo: number;
    parafuso_passo: number;
    tampas_por_persiana: number;
    tipos: Record<TipoPersiana, RegraTipoPersiana>;
  };
  cortina: {
    franzido_wave: number;
    passo_tecido: number;
    passo_botao_wave: number;
    franzido_frente_default: number;
    franzido_tras_default: number;
    tamanho_barra_default: number;
    tipo_barra_default: 'simples' | 'dupla';
    espacamento_ilhos_default: number;
    espacamento_ferragem_default: number;
    aberturas_default: number;
    folga_topo: Record<ModeloCortina, number>;
    tem_entretela: Record<ModeloCortina, boolean>;
  };
}

export interface RegrasResp {
  regras: RegrasCalculo;
  padrao: RegrasCalculo;
}
