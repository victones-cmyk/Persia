// apps/api/src/services/calc/regras.ts
// Regras de cálculo PARAMETRIZÁVEIS (módulo Admin → Regras de Cálculo).
// Os valores ficam guardados em Configuracao (chave 'regras_calculo', JSON) e são
// carregados em memória no boot. O motor de cálculo (persiana/cortina/componentes)
// lê SEMPRE de getRegras() — ao salvar, reflete na hora em toda a aplicação
// (a API é um processo único no Railway). Os valores-padrão (REGRAS_DEFAULT) são
// exatamente as constantes que estavam fixas no código.

import type { PrismaClient } from '@prisma/client';
import { META, type TipoPersiana } from './tipos';
import type { ModeloCortina } from './cortina';

export const CHAVE_REGRAS = 'regras_calculo';

export interface RegraTipoPersiana {
  margem: number; // m somados à altura
  fator_venda: number; // multiplicador da fórmula de venda
  base_venda: 'dimensao' | 'largura';
  dobrar_altura: boolean; // Double Vision
}

export interface RegrasCalculo {
  persiana: {
    tc_fator: number; // TC = altura × fator
    fita_dupla_desconto_rolo: number; // [Largura] - X (rolo)
    fita_colante_desconto_rolo: number;
    base_desconto_rolo: number; // base cônica: [Largura] - X (rolo/DV)
    parafuso_passo: number; // 1 parafuso a cada X m
    tampas_por_persiana: number;
    tipos: Record<TipoPersiana, RegraTipoPersiana>;
  };
  cortina: {
    franzido_wave: number; // largura × fator (tecido do wave)
    passo_tecido: number; // corte do tecido (múltiplo de X m)
    passo_botao_wave: number; // 1 botão a cada X m (cordão wave)
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

const MODELOS: ModeloCortina[] = ['ilhos', 'prega', 'franzido', 'wave'];

function tiposDefault(): Record<TipoPersiana, RegraTipoPersiana> {
  const out = {} as Record<TipoPersiana, RegraTipoPersiana>;
  for (const t of Object.keys(META) as TipoPersiana[]) {
    out[t] = { margem: META[t].margem, fator_venda: META[t].fatorVenda, base_venda: META[t].baseVenda, dobrar_altura: META[t].dobrarAltura };
  }
  return out;
}

export const REGRAS_DEFAULT: RegrasCalculo = {
  persiana: {
    tc_fator: 0.75,
    fita_dupla_desconto_rolo: 0.02,
    fita_colante_desconto_rolo: 0.03,
    base_desconto_rolo: 0.025,
    parafuso_passo: 0.5,
    tampas_por_persiana: 2,
    tipos: tiposDefault(),
  },
  cortina: {
    franzido_wave: 2.7,
    passo_tecido: 0.05,
    passo_botao_wave: 0.05,
    franzido_frente_default: 3,
    franzido_tras_default: 2,
    tamanho_barra_default: 0.1,
    tipo_barra_default: 'dupla',
    espacamento_ilhos_default: 0.15,
    espacamento_ferragem_default: 0.1,
    aberturas_default: 1,
    folga_topo: { ilhos: 0.1, prega: 0.12, franzido: 0.08, wave: 0.12 },
    tem_entretela: { ilhos: true, prega: true, franzido: false, wave: true },
  },
};

const clone = (r: RegrasCalculo): RegrasCalculo => JSON.parse(JSON.stringify(r));

// ---- helpers de coerção/validação ----
const num = (v: unknown, def: number): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], def: T): T => (opts.includes(v as T) ? (v as T) : def);

/** Reconstrói a partir do default, aplicando só valores válidos do input (saneamento). */
export function normalizar(input: unknown): RegrasCalculo {
  const i = (input ?? {}) as Partial<RegrasCalculo>;
  const p = (i.persiana ?? {}) as Partial<RegrasCalculo['persiana']>;
  const c = (i.cortina ?? {}) as Partial<RegrasCalculo['cortina']>;
  const d = REGRAS_DEFAULT;

  const tipos = {} as Record<TipoPersiana, RegraTipoPersiana>;
  for (const t of Object.keys(d.persiana.tipos) as TipoPersiana[]) {
    const rt = (p.tipos?.[t] ?? {}) as Partial<RegraTipoPersiana>;
    const dt = d.persiana.tipos[t];
    tipos[t] = {
      margem: num(rt.margem, dt.margem),
      fator_venda: num(rt.fator_venda, dt.fator_venda),
      base_venda: oneOf(rt.base_venda, ['dimensao', 'largura'] as const, dt.base_venda),
      dobrar_altura: bool(rt.dobrar_altura, dt.dobrar_altura),
    };
  }
  const folga = {} as Record<ModeloCortina, number>;
  const entre = {} as Record<ModeloCortina, boolean>;
  for (const m of MODELOS) {
    folga[m] = num(c.folga_topo?.[m], d.cortina.folga_topo[m]);
    entre[m] = bool(c.tem_entretela?.[m], d.cortina.tem_entretela[m]);
  }

  return {
    persiana: {
      tc_fator: num(p.tc_fator, d.persiana.tc_fator),
      fita_dupla_desconto_rolo: num(p.fita_dupla_desconto_rolo, d.persiana.fita_dupla_desconto_rolo),
      fita_colante_desconto_rolo: num(p.fita_colante_desconto_rolo, d.persiana.fita_colante_desconto_rolo),
      base_desconto_rolo: num(p.base_desconto_rolo, d.persiana.base_desconto_rolo),
      parafuso_passo: num(p.parafuso_passo, d.persiana.parafuso_passo),
      tampas_por_persiana: num(p.tampas_por_persiana, d.persiana.tampas_por_persiana),
      tipos,
    },
    cortina: {
      franzido_wave: num(c.franzido_wave, d.cortina.franzido_wave),
      passo_tecido: num(c.passo_tecido, d.cortina.passo_tecido),
      passo_botao_wave: num(c.passo_botao_wave, d.cortina.passo_botao_wave),
      franzido_frente_default: num(c.franzido_frente_default, d.cortina.franzido_frente_default),
      franzido_tras_default: num(c.franzido_tras_default, d.cortina.franzido_tras_default),
      tamanho_barra_default: num(c.tamanho_barra_default, d.cortina.tamanho_barra_default),
      tipo_barra_default: oneOf(c.tipo_barra_default, ['simples', 'dupla'] as const, d.cortina.tipo_barra_default),
      espacamento_ilhos_default: num(c.espacamento_ilhos_default, d.cortina.espacamento_ilhos_default),
      espacamento_ferragem_default: num(c.espacamento_ferragem_default, d.cortina.espacamento_ferragem_default),
      aberturas_default: num(c.aberturas_default, d.cortina.aberturas_default),
      folga_topo: folga,
      tem_entretela: entre,
    },
  };
}

// ---- store em memória ----
let atual: RegrasCalculo = clone(REGRAS_DEFAULT);

export function getRegras(): RegrasCalculo {
  return atual;
}

/** Carrega do banco no boot; se não houver registro, mantém os padrões. */
export async function carregarRegras(prisma: PrismaClient): Promise<void> {
  try {
    const reg = await prisma.configuracao.findUnique({ where: { chave: CHAVE_REGRAS } });
    if (reg?.valor) atual = normalizar(JSON.parse(reg.valor));
  } catch (e) {
    console.error('[regras] falha ao carregar; usando padrões.', e);
  }
}

/** Salva no banco + atualiza a memória (reflete imediatamente nos cálculos). */
export async function salvarRegras(prisma: PrismaClient, input: unknown): Promise<RegrasCalculo> {
  const regras = normalizar(input);
  await prisma.configuracao.upsert({
    where: { chave: CHAVE_REGRAS },
    update: { valor: JSON.stringify(regras), descricao: 'Regras de cálculo (módulo admin)' },
    create: { chave: CHAVE_REGRAS, valor: JSON.stringify(regras), descricao: 'Regras de cálculo (módulo admin)' },
  });
  atual = regras;
  return atual;
}

export function restaurarPadrao(): RegrasCalculo {
  return clone(REGRAS_DEFAULT);
}
