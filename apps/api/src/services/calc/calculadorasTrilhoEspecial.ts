// Calculadoras dinâmicas de trilhos especiais.
// Cada calculadora é uma composição de produtos do GestãoClick; a fórmula de
// cada produto pode usar LARGURA para definir a quantidade necessária.

import type { PrismaClient } from '@prisma/client';

export const CHAVE_CALCULADORAS_TRILHO_ESPECIAL = 'calculadoras_trilho_especial';

export interface ComponenteCalculadoraTrilho {
  id: string;
  codigo_interno: string;
  descricao: string;
  qtd: string;
  /** Quando preenchido, o produto NÃO é fixo: o vendedor escolhe entre os
   * produtos ativos desse grupo do GestãoClick no orçamento (ex.: cores
   * diferentes de um mesmo item). `codigo_interno` é ignorado nesse modo. */
  grupo_id?: string;
}

export interface VarianteCalculadoraTrilho {
  id: string;
  nome: string;
  motorizado?: boolean;
  componentes: ComponenteCalculadoraTrilho[];
}

export interface CalculadoraTrilhoEspecial {
  id: string;
  nome: string;
  db_tipo_produto: 'trilho_especial';
  ativo?: boolean;
  /** Trilhos motorizados são exportados ao GestãoClick sem descrição técnica. */
  motorizado?: boolean;
  /** Composições alternativas do mesmo modelo de trilho. */
  variantes?: VarianteCalculadoraTrilho[];
  componentes: ComponenteCalculadoraTrilho[];
  /** 'trilho_deslizante': formulário do vendedor troca Largura+TC manual por
   *  Largura+Altura (TC = 75% da altura, calculado); "Lado do motor" vira
   *  "Lado do comando"; e some o campo "Tipo de abertura" (Victor 03/09/2026). */
  layout?: 'padrao' | 'trilho_deslizante';
}

export const CALCULADORAS_TRILHO_ESPECIAL_DEFAULT: CalculadoraTrilhoEspecial[] = [];

let calculadorasCached: CalculadoraTrilhoEspecial[] = [];

function normalizarComponentes(componentes: unknown): ComponenteCalculadoraTrilho[] {
  return (Array.isArray(componentes) ? componentes : []).map((comp, index) => {
    const c = comp as Partial<ComponenteCalculadoraTrilho>;
    const grupoId = String(c.grupo_id ?? '').trim();
    return {
      id: String(c.id || `componente_${index + 1}`),
      codigo_interno: String(c.codigo_interno ?? ''),
      descricao: String(c.descricao ?? ''),
      qtd: String(c.qtd ?? ''),
      ...(grupoId ? { grupo_id: grupoId } : {}),
    };
  });
}

function normalizar(calculadoras: CalculadoraTrilhoEspecial[]): CalculadoraTrilhoEspecial[] {
  return calculadoras.map((c) => ({
    ...c,
    db_tipo_produto: 'trilho_especial',
    ativo: c.ativo !== false,
    layout: c.layout === 'trilho_deslizante' ? 'trilho_deslizante' : 'padrao',
    variantes: (Array.isArray(c.variantes) && c.variantes.length > 0 ? c.variantes : [{
      id: 'padrao',
      nome: 'Padrão',
      // Mantém os modelos atuais motorizados funcionando sem recadastro.
      motorizado: c.motorizado === true || /motoriz/i.test(c.nome),
      componentes: Array.isArray(c.componentes) ? c.componentes : [],
    }]).map((v, index) => ({
      id: String(v.id || `variante_${index + 1}`),
      nome: String(v.nome || `Variante ${index + 1}`),
      motorizado: v.motorizado === true,
      componentes: normalizarComponentes(v.componentes),
    })),
    // Compatibilidade com registros e integrações antigas.
    componentes: normalizarComponentes(c.componentes),
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
