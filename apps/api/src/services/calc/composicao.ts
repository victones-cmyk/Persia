// apps/api/src/services/calc/composicao.ts
// Composição por tipo/modelo: QUAIS produtos do GestãoClick entram em cada cálculo.
// Serve para o Admin (Regras de Cálculo) mostrar ao usuário, ao alterar um preço no
// GC, ONDE isso influencia a calculadora. Distingue dois grupos:
//   • afeta_preco   → produtos cujo preço do GC entra no VALOR do orçamento;
//   • lista_tecnica → componentes que saem na OS mas NÃO entram no preço (persiana).
//
// IMPORTANTE (assimetria real do motor):
//   • PERSIANA: o valor usa SÓ o preço do TECIDO (RN-03). Motor, fita, base, mão de
//     obra etc. são lista técnica e NÃO mudam o preço (ver componentes.ts:9).
//   • CORTINA: o valor soma TECIDO + cada ACESSÓRIO lido do GC (orcamentoCortinaController).
//
// A lista de acessórios da cortina é DERIVADA do próprio motor (roda por fixação e
// mapeia cada item para o grupo do GC), então acompanha mudanças de regra sem drift.

import { META, type TipoPersiana } from './tipos';
import { RECEITAS_PERSIANA } from './persianaReceitas.data';
import { familiaDoTipo } from './persianaPreco';
import { calcularCortinaMultiCamada, type ModeloCortina } from './cortina';
import { categoriaDoItem, GRUPOS_ACESSORIO_CORTINA, type CategoriaAcessorio } from '../gc/acessorios';
import { SUBGRUPO_PERSIANA, GRUPO_TECIDO_CORTINA } from '../gc/tecidos';

export interface ItemComposicao {
  rotulo: string; // nome amigável do produto/grupo
  grupo_gc?: string; // nome do grupo no GestãoClick
  grupo_gc_id?: string; // id do grupo no GestãoClick
  codigo_gc?: string; // código do produto (componentes condicionais da persiana)
  obs?: string; // observação (ex.: "condicional", "só varão / trilho")
}
export interface ComposicaoTipo {
  afeta_preco: ItemComposicao[];
  lista_tecnica: ItemComposicao[];
}
export interface ComposicaoCalculo {
  persiana: Record<TipoPersiana, ComposicaoTipo>;
  cortina: Record<ModeloCortina, ComposicaoTipo>;
}

// --- Persiana -------------------------------------------------------------

/** Material (subgrupo de tecido no GC) do tipo de persiana. */
function materialDoTipo(tipo: TipoPersiana): { id: string; nome: string } {
  if (tipo.includes('blackout')) return { id: SUBGRUPO_PERSIANA.blackout, nome: 'BLACKOUT' };
  if (tipo.includes('screen')) return { id: SUBGRUPO_PERSIANA.screen, nome: 'TELA SOLAR' };
  if (tipo.includes('translucido')) return { id: SUBGRUPO_PERSIANA.translucido, nome: 'TRANSLÚCIDO' };
  return { id: SUBGRUPO_PERSIANA.double_vision, nome: 'DOUBLE VISION' };
}

function composicaoPersiana(tipo: TipoPersiana): ComposicaoTipo {
  const mat = materialDoTipo(tipo);

  // Modelo novo (Victor): o valor da persiana = soma de TODOS os componentes + tecido,
  // a VAREJO, com cada preço puxado do GestãoClick pelo código. Logo, todos os
  // componentes da receita AFETAM o preço (não há mais "lista técnica" que não conta).
  const afeta_preco: ItemComposicao[] = [
    {
      rotulo: `Tecido — ${mat.nome}`,
      grupo_gc: `TECIDOS PARA PERSIANA › ${mat.nome}`,
      grupo_gc_id: mat.id,
      obs: 'preço do tecido escolhido (a tela solar é por m²)',
    },
  ];

  // Receita representativa (com bandô; cai p/ sem bandô se não houver). Os componentes
  // variam um pouco conforme o acionamento (com/sem bandô, motor), mas todos entram no preço.
  const familia = familiaDoTipo(tipo);
  const receita = RECEITAS_PERSIANA[familia]?.com_bando ?? RECEITAS_PERSIANA[familia]?.sem_bando;
  const vistos = new Set<string>();
  for (const c of receita?.componentes ?? []) {
    if (vistos.has(c.descricao)) continue;
    vistos.add(c.descricao);
    afeta_preco.push({ rotulo: c.descricao, obs: 'componente — preço VAREJO do GestãoClick' });
  }

  return { afeta_preco, lista_tecnica: [] };
}

// --- Cortina --------------------------------------------------------------

const FIXACOES = ['varao', 'trilho', 'varao_suico'] as const;
const FIX_LABEL: Record<(typeof FIXACOES)[number], string> = {
  varao: 'varão',
  trilho: 'trilho',
  varao_suico: 'varão suíço',
};

// Nome amigável do grupo de acessório no GestãoClick (espelha os comentários de GRUPOS_ACESSORIO_CORTINA).
const GRUPO_NOME: Record<CategoriaAcessorio, string> = {
  varao: 'VARÃO',
  varao_suico: 'VARÃO SUIÇO',
  trilho: 'TRILHOS',
  suporte_varao: 'SUPORTES PARA VARÃO',
  suporte_varao_suico: 'SUPORTE PARA VARÃO SUIÇO',
  ilhos: 'ILHOS',
  argola: 'ARGOLAS',
  rodizio: 'RODIZIOS',
  ponteira: 'PONTEIRAS',
  terminal: 'TERMINAIS VARÃO SUIÇO E TRILHO',
  entretela: 'ENTRETELA (KOS)',
  wave: 'WAVE',
};

// Ordem de exibição amigável dos grupos.
const ORDEM_CAT: CategoriaAcessorio[] = [
  'varao', 'varao_suico', 'trilho',
  'suporte_varao', 'suporte_varao_suico',
  'ilhos', 'argola', 'rodizio', 'wave', 'terminal', 'ponteira', 'entretela',
];

function composicaoCortina(modelo: ModeloCortina): ComposicaoTipo {
  // Roda o motor por fixação (valores de amostra) e coleta as categorias de acessório
  // que aparecem, com o conjunto de fixações em que cada uma surge (para a observação).
  const porCategoria = new Map<CategoriaAcessorio, Set<string>>();
  for (const fix of FIXACOES) {
    let r;
    try {
      r = calcularCortinaMultiCamada({ modelo, fixacao: fix, largura: 2, altura: 2, camadas: [{ largura_tecido: 2.8 }] });
    } catch {
      continue;
    }
    for (const it of r.acessorios) {
      const cat = categoriaDoItem(it.item, fix);
      if (!cat) continue;
      if (!porCategoria.has(cat)) porCategoria.set(cat, new Set());
      porCategoria.get(cat)!.add(fix);
    }
  }

  const afeta_preco: ItemComposicao[] = [
    { rotulo: 'Tecido', grupo_gc: 'TECIDOS PARA CORTINA', grupo_gc_id: GRUPO_TECIDO_CORTINA, obs: 'preço por metro do tecido (por camada)' },
  ];
  for (const cat of ORDEM_CAT) {
    const fixSet = porCategoria.get(cat);
    if (!fixSet) continue;
    const obs = fixSet.size < FIXACOES.length
      ? `só ${[...FIXACOES].filter((f) => fixSet.has(f)).map((f) => FIX_LABEL[f]).join(' / ')}`
      : undefined;
    afeta_preco.push({ rotulo: GRUPO_NOME[cat], grupo_gc: GRUPO_NOME[cat], grupo_gc_id: GRUPOS_ACESSORIO_CORTINA[cat], obs });
  }

  return { afeta_preco, lista_tecnica: [] };
}

// --- Agregado -------------------------------------------------------------

const MODELOS: ModeloCortina[] = ['ilhos', 'prega', 'franzido', 'wave'];

/** Composição completa (persiana + cortina). Cálculo puro, sem chamadas ao GC. */
export function composicaoCalculo(): ComposicaoCalculo {
  const persiana = {} as Record<TipoPersiana, ComposicaoTipo>;
  for (const tipo of Object.keys(META) as TipoPersiana[]) persiana[tipo] = composicaoPersiana(tipo);

  const cortina = {} as Record<ModeloCortina, ComposicaoTipo>;
  for (const m of MODELOS) cortina[m] = composicaoCortina(m);

  return { persiana, cortina };
}
