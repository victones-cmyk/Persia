// Calculadoras dinâmicas de trilhos especiais.
// Cada calculadora é uma composição de produtos do GestãoClick; a fórmula de
// cada produto pode usar LARGURA para definir a quantidade necessária.

import type { PrismaClient } from '@prisma/client';

export const CHAVE_CALCULADORAS_TRILHO_ESPECIAL = 'calculadoras_trilho_especial';

export interface ComponenteCalculadoraTrilho {
  codigo_interno: string;
  descricao: string;
  qtd: string;
}

export interface CalculadoraTrilhoEspecial {
  id: string;
  nome: string;
  db_tipo_produto: 'trilho_especial';
  ativo?: boolean;
  /** Trilhos motorizados são exportados ao GestãoClick sem descrição técnica. */
  motorizado?: boolean;
  componentes: ComponenteCalculadoraTrilho[];
}

export const CALCULADORAS_TRILHO_ESPECIAL_DEFAULT: CalculadoraTrilhoEspecial[] = [];

let calculadorasCached: CalculadoraTrilhoEspecial[] = [];

function normalizar(calculadoras: CalculadoraTrilhoEspecial[]): CalculadoraTrilhoEspecial[] {
  return calculadoras.map((c) => ({
    ...c,
    db_tipo_produto: 'trilho_especial',
    ativo: c.ativo !== false,
    // Mantém as calculadoras já cadastradas funcionando ao reconhecer o nome
    // enquanto o administrador ainda não salvou a nova opção explicitamente.
    motorizado: c.motorizado === true || /motoriz/i.test(c.nome),
    componentes: Array.isArray(c.componentes) ? c.componentes : [],
  }));
}

export function getCalculadorasTrilhoEspecial(): CalculadoraTrilhoEspecial[] {
  return calculadorasCached;
}

export function getCalculadorasTrilhoEspecialAtivas(): CalculadoraTrilhoEspecial[] {
  return getCalculadorasTrilhoEspecial().filter((c) => c.ativo !== false);
}

export function encontrarCalculadoraTrilhoEspecial(id: string): CalculadoraTrilhoEspecial | undefined {
  return getCalculadorasTrilhoEspecial().find((c) => c.id === id);
}

export async function carregarCalculadorasTrilhoEspecial(prisma: PrismaClient): Promise<void> {
  try {
    const config = await prisma.configuracao.findUnique({ where: { chave: CHAVE_CALCULADORAS_TRILHO_ESPECIAL } });
    const salvas = config?.valor ? JSON.parse(config.valor) : CALCULADORAS_TRILHO_ESPECIAL_DEFAULT;
    calculadorasCached = normalizar(Array.isArray(salvas) ? salvas : []);
    if (!config) {
      await prisma.configuracao.create({
        data: {
          chave: CHAVE_CALCULADORAS_TRILHO_ESPECIAL,
          valor: JSON.stringify(calculadorasCached),
          descricao: 'Calculadoras de trilhos especiais (dinâmicas)',
        },
      });
    }
  } catch (e) {
    console.error('[calculadorasTrilhoEspecial] falha ao carregar do banco.', e);
    calculadorasCached = [];
  }
}

export async function salvarCalculadorasTrilhoEspecial(
  prisma: PrismaClient,
  novasCalculadoras: CalculadoraTrilhoEspecial[],
): Promise<CalculadoraTrilhoEspecial[]> {
  const normalizadas = normalizar(novasCalculadoras);
  await prisma.configuracao.upsert({
    where: { chave: CHAVE_CALCULADORAS_TRILHO_ESPECIAL },
    update: { valor: JSON.stringify(normalizadas) },
    create: {
      chave: CHAVE_CALCULADORAS_TRILHO_ESPECIAL,
      valor: JSON.stringify(normalizadas),
      descricao: 'Calculadoras de trilhos especiais (dinâmicas)',
    },
  });
  calculadorasCached = normalizadas;
  return calculadorasCached;
}
