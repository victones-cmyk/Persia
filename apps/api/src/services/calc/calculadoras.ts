// apps/api/src/services/calc/calculadoras.ts
// Gerenciador de Calculadoras e Receitas Dinâmicas (Persiana).
// Carrega as calculadoras da tabela Configuracao (chave 'calculadoras_persiana') em memória.
// Se não existirem registros no banco de dados, popula com as receitas padrão de persiana.

import type { PrismaClient } from '@prisma/client';
import { RECEITAS_PERSIANA } from './persianaReceitas.data';

export const CHAVE_CALCULADORAS = 'calculadoras_persiana';

export type FamiliaPersiana = 'rolo_bk_translucido' | 'double_vision' | 'tela_solar' | 'romana' | 'romana_tela_solar' | 'vertical';

export interface ComponenteCalculadora {
  codigo_interno: string;
  descricao: string;
  qtd: string;
}

export interface ReceitaCalculadora {
  componentes: ComponenteCalculadora[];
  tecido_qtd: string;
}

export interface CalculadoraPersiana {
  id: string; // e.g. 'persiana_rolo_blackout'
  nome: string; // e.g. 'Persiana Rolo Blackout'
  db_tipo_produto: string; // Mapeamento para o enum TipoProduto do prisma
  codigo_gc: string; // ID do produto no GestãoClick (e.g. '2591')
  familia: FamiliaPersiana;
  /** Grupos/subgrupos de tecido do GestãoClick permitidos nesta calculadora. */
  tecido_grupo_ids?: string[];
  /** Quando falso, permite tecidos/produtos do GC sem o campo LARGURA cadastrado. */
  largura_tecido_obrigatoria?: boolean;
  /** Mostra os campos Emissor/Tipo de emissor/Canal no item quando motorizado (Victor
   * 01/08/2026). O vendedor escolhe o produto entre os itens ativos do grupo EMISSOR
   * (6006913) do GestãoClick — ver GRUPO_EMISSOR_PERSIANA em gc/componentesPersiana.ts. */
  suporta_emissor?: boolean;
  margem: number;
  dobrar_altura: boolean;
  base_venda: 'dimensao' | 'largura';
  fator_venda: number;
  mao_de_obra: string;
  ativo?: boolean;
  receitas: {
    com_bando?: ReceitaCalculadora;
    sem_bando?: ReceitaCalculadora;
    motor_com_bando?: ReceitaCalculadora;
    motor_sem_bando?: ReceitaCalculadora;
  };
}

// ---------------------------------------------------------------------------
// Definições padrão (extraídas de tipos.ts e persianaReceitas.data.ts)
// ---------------------------------------------------------------------------
export const CALCULADORAS_DEFAULT: CalculadoraPersiana[] = [
  {
    id: 'persiana_rolo_blackout',
    nome: 'Persiana Rolo Blackout',
    db_tipo_produto: 'persiana_rolo_blackout',
    codigo_gc: '2591',
    familia: 'rolo_bk_translucido',
    margem: 0.15,
    dobrar_altura: false,
    base_venda: 'dimensao',
    fator_venda: 1.0,
    mao_de_obra: 'MÃO DE OBRA PERSIANA',
    suporta_emissor: true,
    receitas: {
      com_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.com_bando,
      sem_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.sem_bando,
      motor_com_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.motor_com_bando,
      motor_sem_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.motor_sem_bando,
    },
  },
  {
    id: 'persiana_rolo_screen',
    nome: 'Persiana Rolo Screen',
    db_tipo_produto: 'persiana_rolo_screen',
    codigo_gc: '2592',
    familia: 'tela_solar',
    margem: 0.15,
    dobrar_altura: false,
    base_venda: 'largura',
    fator_venda: 1.3,
    mao_de_obra: 'MÃO DE OBRA PERSIANA',
    suporta_emissor: true,
    receitas: {
      com_bando: RECEITAS_PERSIANA.tela_solar?.com_bando,
      sem_bando: RECEITAS_PERSIANA.tela_solar?.sem_bando,
      motor_com_bando: RECEITAS_PERSIANA.tela_solar?.motor_com_bando,
      motor_sem_bando: RECEITAS_PERSIANA.tela_solar?.motor_sem_bando,
    },
  },
  {
    id: 'persiana_rolo_translucido',
    nome: 'Persiana Rolo Translúcido',
    db_tipo_produto: 'persiana_rolo_translucido',
    codigo_gc: '2608',
    familia: 'rolo_bk_translucido',
    margem: 0.15,
    dobrar_altura: false,
    base_venda: 'dimensao',
    fator_venda: 1.0,
    mao_de_obra: 'MÃO DE OBRA PERSIANA ROMANA',
    suporta_emissor: true,
    receitas: {
      com_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.com_bando,
      sem_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.sem_bando,
      motor_com_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.motor_com_bando,
      motor_sem_bando: RECEITAS_PERSIANA.rolo_bk_translucido?.motor_sem_bando,
    },
  },
  {
    id: 'persiana_rolo_double_vision',
    nome: 'Persiana Double Vision',
    db_tipo_produto: 'persiana_rolo_double_vision',
    codigo_gc: '2606',
    familia: 'double_vision',
    margem: 0.15,
    dobrar_altura: true,
    base_venda: 'dimensao',
    fator_venda: 1.0,
    mao_de_obra: 'MÃO DE OBRA PERSIANA',
    suporta_emissor: true,
    receitas: {
      com_bando: RECEITAS_PERSIANA.double_vision?.com_bando,
      sem_bando: RECEITAS_PERSIANA.double_vision?.sem_bando,
      motor_com_bando: RECEITAS_PERSIANA.double_vision?.motor_com_bando,
      motor_sem_bando: RECEITAS_PERSIANA.double_vision?.motor_sem_bando,
    },
  },
  {
    id: 'persiana_romana_blackout',
    nome: 'Persiana Romana Blackout',
    db_tipo_produto: 'persiana_romana_blackout',
    codigo_gc: '2611',
    familia: 'romana',
    margem: 0.08,
    dobrar_altura: false,
    base_venda: 'dimensao',
    fator_venda: 1.3,
    mao_de_obra: 'MÃO DE OBRA PERSIANA ROMANA',
    receitas: {
      com_bando: RECEITAS_PERSIANA.romana?.com_bando,
      sem_bando: RECEITAS_PERSIANA.romana?.sem_bando,
    },
  },
  {
    id: 'persiana_romana_screen',
    nome: 'Persiana Romana Screen',
    db_tipo_produto: 'persiana_romana_screen',
    codigo_gc: '2612',
    familia: 'romana_tela_solar',
    margem: 0.08,
    dobrar_altura: false,
    base_venda: 'largura',
    fator_venda: 1.2,
    mao_de_obra: 'MÃO DE OBRA PERSIANA ROMANA',
    receitas: {
      com_bando: RECEITAS_PERSIANA.romana_tela_solar?.com_bando,
      sem_bando: RECEITAS_PERSIANA.romana_tela_solar?.sem_bando,
    },
  },
  {
    id: 'persiana_romana_translucido',
    nome: 'Persiana Romana Translúcido',
    db_tipo_produto: 'persiana_romana_translucido',
    codigo_gc: '2601',
    familia: 'romana',
    margem: 0.08,
    dobrar_altura: false,
    base_venda: 'dimensao',
    fator_venda: 1.2,
    mao_de_obra: 'MÃO DE OBRA PERSIANA ROMANA',
    receitas: {
      com_bando: RECEITAS_PERSIANA.romana?.com_bando,
      sem_bando: RECEITAS_PERSIANA.romana?.sem_bando,
    },
  },
  {
    id: 'persiana_vertical',
    nome: 'Persiana Vertical',
    db_tipo_produto: 'persiana_rolo_blackout',
    codigo_gc: '',
    familia: 'vertical',
    tecido_grupo_ids: [],
    largura_tecido_obrigatoria: false,
    margem: 0,
    dobrar_altura: false,
    base_venda: 'largura',
    fator_venda: 1.0,
    mao_de_obra: 'MÃO DE OBRA PERSIANA VERTICAL',
    ativo: true,
    receitas: {
      sem_bando: { componentes: [], tecido_qtd: 'LARGURA*ALTURA' },
    },
  },
];

// ---- Armazenamento em memória (cache) ----
let calculadorasCached: CalculadoraPersiana[] = [];

function normalizarCalculadoras(calculadoras: CalculadoraPersiana[]): CalculadoraPersiana[] {
  return calculadoras.map((c) => ({
    ...c,
    ativo: c.ativo !== false,
    largura_tecido_obrigatoria: c.largura_tecido_obrigatoria !== false,
  }));
}

function anexarDefaultsAusentes(calculadoras: CalculadoraPersiana[]): CalculadoraPersiana[] {
  const ids = new Set(calculadoras.map((c) => c.id));
  const faltantes = CALCULADORAS_DEFAULT.filter((c) => !ids.has(c.id));
  return faltantes.length > 0 ? [...calculadoras, ...faltantes] : calculadoras;
}

export function getCalculadoras(): CalculadoraPersiana[] {
  return calculadorasCached.length > 0 ? calculadorasCached : CALCULADORAS_DEFAULT;
}

export function getCalculadorasAtivas(): CalculadoraPersiana[] {
  return getCalculadoras().filter((c) => c.ativo !== false);
}

export function encontrarCalculadora(id: string): CalculadoraPersiana | undefined {
  return getCalculadoras().find((c) => c.id === id);
}

export function exigeLarguraTecido(tipo: string): boolean {
  const calc = encontrarCalculadora(tipo);
  return calc?.largura_tecido_obrigatoria !== false;
}

/** Carrega do banco no boot; se não houver registro (ou se o registro existente for legado sem codigo_gc), popula com as novas. */
export async function carregarCalculadoras(prisma: PrismaClient): Promise<void> {
  try {
    const config = await prisma.configuracao.findUnique({ where: { chave: CHAVE_CALCULADORAS } });
    const salvas = config?.valor ? JSON.parse(config.valor) : null;
    if (salvas?.[0]?.codigo_gc !== undefined) {
      const carregadas = anexarDefaultsAusentes(salvas);
      calculadorasCached = normalizarCalculadoras(carregadas);
      if (carregadas.length !== salvas.length && 'update' in prisma.configuracao) {
        await (prisma.configuracao as unknown as { update: (args: unknown) => Promise<unknown> }).update({
          where: { chave: CHAVE_CALCULADORAS },
          data: { valor: JSON.stringify(calculadorasCached) },
        });
      }
    } else {
      // Popula ou sobrescreve com os novos defaults
      calculadorasCached = normalizarCalculadoras([...CALCULADORAS_DEFAULT]);
      await prisma.configuracao.upsert({
        where: { chave: CHAVE_CALCULADORAS },
        update: { valor: JSON.stringify(CALCULADORAS_DEFAULT), descricao: 'Calculadoras e receitas de persianas (dinâmicas)' },
        create: { chave: CHAVE_CALCULADORAS, valor: JSON.stringify(CALCULADORAS_DEFAULT), descricao: 'Calculadoras e receitas de persianas (dinâmicas)' },
      });
    }
  } catch (e) {
    console.error('[calculadoras] falha ao carregar do banco. Usando padrões.', e);
    calculadorasCached = normalizarCalculadoras([...CALCULADORAS_DEFAULT]);
  }
}

/** Salva no banco e atualiza o cache em memória */
export async function salvarCalculadoras(prisma: PrismaClient, novasCalculadoras: CalculadoraPersiana[]): Promise<CalculadoraPersiana[]> {
  const normalizadas = normalizarCalculadoras(novasCalculadoras);
  await prisma.configuracao.upsert({
    where: { chave: CHAVE_CALCULADORAS },
    update: { valor: JSON.stringify(normalizadas) },
    create: { chave: CHAVE_CALCULADORAS, valor: JSON.stringify(normalizadas), descricao: 'Calculadoras e receitas de persianas (dinâmicas)' },
  });
  calculadorasCached = normalizadas;
  return calculadorasCached;
}
