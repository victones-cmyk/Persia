// apps/api/src/services/calc/calculadorasCortina.ts
// Gerenciador de Calculadoras e Receitas Dinâmicas (Cortina).
// Carrega as calculadoras da tabela Configuracao (chave 'calculadoras_cortina') em memória.
// Se não existirem registros no banco de dados, popula com os padrões.

import type { PrismaClient } from '@prisma/client';
import type { ModeloCortina, ModeloCamadaEntrada, FixacaoCortina } from './cortina';

export const CHAVE_CALCULADORAS_CORTINA = 'calculadoras_cortina';

export interface CamadaCalculadoraCortina {
  id: string;
  nome: string;
  /** Aceita as variantes de prega (Americana/Macho/Fêmea): mesmo cálculo, nome
   *  próprio na ficha do produto enviada ao GestãoClick. */
  modelo_default: ModeloCamadaEntrada;
  franzido_default?: number;
}

export interface CalculadoraCortina {
  id: string;
  nome: string;
  db_tipo_produto: string; // 'cortina'
  codigo_gc: string; // ID do produto no GestãoClick (e.g. '5913')
  modelo_base: ModeloCortina;
  fixacao_default: FixacaoCortina;
  tamanho_barra_default: number; // em metros
  tipo_barra_default: 'simples' | 'dupla';
  aberturas_default: number;
  /** Tecido adicional por bainhas laterais, em metros. */
  bainhas_laterais_default: number;
  ativo?: boolean;
  camadas: CamadaCalculadoraCortina[];
}

export const CALCULADORAS_CORTINA_DEFAULT: CalculadoraCortina[] = [
  {
    id: 'cortina_wave_simples',
    nome: 'Cortina Wave Simples (Trilho)',
    db_tipo_produto: 'cortina',
    codigo_gc: '5913',
    modelo_base: 'wave',
    fixacao_default: 'trilho',
    tamanho_barra_default: 0.1,
    tipo_barra_default: 'dupla',
    aberturas_default: 1,
    bainhas_laterais_default: 0,
    camadas: [
      {
        id: 'camada_frente',
        nome: 'Frente',
        modelo_default: 'wave',
        franzido_default: 2.7,
      },
    ],
  },
  {
    id: 'cortina_wave_forro_trilho',
    nome: 'Cortina Wave + Forro Franzido (Trilho Duplo)',
    db_tipo_produto: 'cortina',
    codigo_gc: '5914',
    modelo_base: 'wave',
    fixacao_default: 'trilho',
    tamanho_barra_default: 0.1,
    tipo_barra_default: 'dupla',
    aberturas_default: 1,
    bainhas_laterais_default: 0,
    camadas: [
      {
        id: 'camada_frente',
        nome: 'Frente',
        modelo_default: 'wave',
        franzido_default: 2.7,
      },
      {
        id: 'camada_forro',
        nome: 'Forro/Trás',
        modelo_default: 'franzido',
        franzido_default: 2,
      },
    ],
  },
  {
    id: 'cortina_ilhos_simples',
    nome: 'Cortina Ilhós Simples (Varão)',
    db_tipo_produto: 'cortina',
    codigo_gc: '5915',
    modelo_base: 'ilhos',
    fixacao_default: 'varao',
    tamanho_barra_default: 0.1,
    tipo_barra_default: 'dupla',
    aberturas_default: 1,
    bainhas_laterais_default: 0,
    camadas: [
      {
        id: 'camada_frente',
        nome: 'Frente',
        modelo_default: 'ilhos',
        franzido_default: 3,
      },
    ],
  },
  {
    id: 'cortina_prega_simples',
    nome: 'Cortina Prega Americana Simples (Varão)',
    db_tipo_produto: 'cortina',
    codigo_gc: '5916',
    modelo_base: 'prega',
    fixacao_default: 'varao',
    tamanho_barra_default: 0.1,
    tipo_barra_default: 'dupla',
    aberturas_default: 1,
    bainhas_laterais_default: 0,
    camadas: [
      {
        id: 'camada_frente',
        nome: 'Frente',
        modelo_default: 'prega',
        franzido_default: 3,
      },
    ],
  },
  {
    id: 'cortina_wave_varao_suico',
    nome: 'Cortina Wave Simples (Varão Suíço)',
    db_tipo_produto: 'cortina',
    codigo_gc: '5917',
    modelo_base: 'wave',
    fixacao_default: 'varao_suico',
    tamanho_barra_default: 0.1,
    tipo_barra_default: 'dupla',
    aberturas_default: 1,
    bainhas_laterais_default: 0,
    camadas: [
      {
        id: 'camada_frente',
        nome: 'Frente',
        modelo_default: 'wave',
        franzido_default: 2.7,
      },
    ],
  },
];

let calculadorasCached: CalculadoraCortina[] = [];

function normalizarCalculadorasCortina(calculadoras: CalculadoraCortina[]): CalculadoraCortina[] {
  return calculadoras.map((c) => ({
    ...c,
    ativo: c.ativo !== false,
    bainhas_laterais_default: Number.isFinite(Number(c.bainhas_laterais_default)) ? Number(c.bainhas_laterais_default) : 0,
  }));
}

export function getCalculadorasCortina(): CalculadoraCortina[] {
  return calculadorasCached.length > 0 ? calculadorasCached : CALCULADORAS_CORTINA_DEFAULT;
}

export function getCalculadorasCortinaAtivas(): CalculadoraCortina[] {
  return getCalculadorasCortina().filter((c) => c.ativo !== false);
}

export function encontrarCalculadoraCortina(id: string): CalculadoraCortina | undefined {
  return getCalculadorasCortina().find((c) => c.id === id);
}

/** Carrega do banco no boot; se não existir, popula com as padrão. */
export async function carregarCalculadorasCortina(prisma: PrismaClient): Promise<void> {
  try {
    const config = await prisma.configuracao.findUnique({ where: { chave: CHAVE_CALCULADORAS_CORTINA } });
    if (config?.valor) {
      calculadorasCached = normalizarCalculadorasCortina(JSON.parse(config.valor));
    } else {
      calculadorasCached = normalizarCalculadorasCortina([...CALCULADORAS_CORTINA_DEFAULT]);
      await prisma.configuracao.upsert({
        where: { chave: CHAVE_CALCULADORAS_CORTINA },
        update: { valor: JSON.stringify(CALCULADORAS_CORTINA_DEFAULT), descricao: 'Calculadoras e receitas de cortinas (dinâmicas)' },
        create: { chave: CHAVE_CALCULADORAS_CORTINA, valor: JSON.stringify(CALCULADORAS_CORTINA_DEFAULT), descricao: 'Calculadoras e receitas de cortinas (dinâmicas)' },
      });
    }
  } catch (e) {
    console.error('[calculadorasCortina] falha ao carregar do banco. Usando padrões.', e);
    calculadorasCached = normalizarCalculadorasCortina([...CALCULADORAS_CORTINA_DEFAULT]);
  }
}

/** Salva no banco e atualiza o cache em memória */
export async function salvarCalculadorasCortina(prisma: PrismaClient, novasCalculadoras: CalculadoraCortina[]): Promise<CalculadoraCortina[]> {
  const normalizadas = normalizarCalculadorasCortina(novasCalculadoras);
  await prisma.configuracao.upsert({
    where: { chave: CHAVE_CALCULADORAS_CORTINA },
    update: { valor: JSON.stringify(normalizadas) },
    create: { chave: CHAVE_CALCULADORAS_CORTINA, valor: JSON.stringify(normalizadas), descricao: 'Calculadoras e receitas de cortinas (dinâmicas)' },
  });
  calculadorasCached = normalizadas;
  return calculadorasCached;
}
