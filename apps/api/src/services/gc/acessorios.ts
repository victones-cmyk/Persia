// apps/api/src/services/gc/acessorios.ts
// Acessórios de cortina lidos do GestãoClick, por grupo (Victor agrupou em 17/06/2026
// — mapa em decisions.md §9.6). O motor calcula a QUANTIDADE de cada acessório; o
// vendedor ESCOLHE o produto dentro do grupo (há variações de cor/medida) e daqui
// sai o PREÇO (tabela VAREJO). Instalação entra como serviço (/api/servicos).
//
// Leitura apenas (GET). Cache de 5 min para não repetir as chamadas a cada form.

import { listarProdutos, listarServicos, type GcProduto } from './catalogos';

// Categoria de acessório (motor) → grupo de produto no GestãoClick.
export const GRUPOS_ACESSORIO_CORTINA = {
  varao: '5923372', // VARÃO
  varao_suico: '5923373', // VARÃO SUIÇO
  trilho: '5923338', // TRILHOS
  suporte_varao: '5893619', // SUPORTES PARA VARÃO
  suporte_varao_suico: '5923368', // SUPORTE PARA VARÃO SUIÇO
  ilhos: '5894379', // ILHOS
  argola: '5894205', // ARGOLAS
  rodizio: '5923339', // RODIZIOS (rodízios/ganchos de trilho)
  ponteira: '5900771', // PONTEIRAS
  terminal: '5923367', // TERMINAIS VARÃO SUIÇO E TRILHO
  entretela: '5923710', // ENTRETELA (KOS)
  wave: '5923711', // WAVE (cordão, rodízio wave, base click, fita wave)
} as const;

export type CategoriaAcessorio = keyof typeof GRUPOS_ACESSORIO_CORTINA;

export interface AcessorioOpcao {
  id: string;
  nome: string;
  preco: number; // VAREJO
}

export interface ServicoInstalacao {
  id: string;
  nome: string;
  valor: number;
}

const VAREJO_TIPO_ID = '10969';

/** Preço VAREJO do produto (fallback no valor_venda raiz). */
function precoVarejo(p: GcProduto): number {
  const v = (p.valores ?? []).find((x) => x.tipo_id === VAREJO_TIPO_ID || x.nome_tipo === 'VAREJO');
  const n = Number((v ? v.valor_venda : p.valor_venda) ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function ordenaPorNome(a: AcessorioOpcao, b: AcessorioOpcao): number {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

interface CacheAcessorios {
  acessorios: Record<CategoriaAcessorio, AcessorioOpcao[]>;
  instalacoes: ServicoInstalacao[];
}
let cache: { dados: CacheAcessorios; expira: number } | null = null;
const TTL_MS = 60 * 1000; // 1 min — novos acessórios do GC aparecem rápido sem refetch a cada form

/** Lê todos os grupos de acessório + serviços de instalação (com cache de 1 min). */
export async function listarAcessoriosCortina(): Promise<CacheAcessorios> {
  if (cache && cache.expira > Date.now()) return cache.dados;

  const categorias = Object.keys(GRUPOS_ACESSORIO_CORTINA) as CategoriaAcessorio[];
  const acessorios = {} as Record<CategoriaAcessorio, AcessorioOpcao[]>;
  // Sequencial: o p-queue do client já serializa e respeita o rate limit (3 req/s).
  for (const cat of categorias) {
    const produtos = await listarProdutos({ grupo_id: GRUPOS_ACESSORIO_CORTINA[cat], ativo: 1 });
    acessorios[cat] = produtos
      .map((p) => ({ id: p.id, nome: p.nome, preco: precoVarejo(p) }))
      .sort(ordenaPorNome);
  }

  const servicos = await listarServicos();
  const instalacoes = servicos
    .filter((s) => /instala/i.test(s.nome))
    .map((s) => ({ id: s.id, nome: s.nome, valor: Number(s.valor_venda) || 0 }))
    .sort((a, b) => a.valor - b.valor);

  cache = { dados: { acessorios, instalacoes }, expira: Date.now() + TTL_MS };
  return cache.dados;
}

/** Busca um acessório específico (por id) dentro de um grupo — usado na montagem do orçamento. */
export async function buscarAcessorioGc(categoria: CategoriaAcessorio, id: string): Promise<AcessorioOpcao | null> {
  const { acessorios } = await listarAcessoriosCortina();
  return acessorios[categoria]?.find((a) => a.id === id) ?? null;
}

/**
 * Mapeia o nome do item gerado pelo motor (cortina.ts) para a categoria/grupo do GC,
 * para a tela montar o seletor de produto certo. `fixacao` decide o grupo do suporte.
 */
export function categoriaDoItem(item: string, fixacao: 'varao' | 'trilho' | 'varao_suico'): CategoriaAcessorio | null {
  // Remove sufixos de posição ("(camada N)", "(traseiro/traseira)") sem mexer em
  // nomes que têm parênteses próprios (ex.: "Entretela (KOS)").
  const base = item.replace(/\s*\((?:camada \d+|traseiro|traseira)\)$/i, '').trim();
  switch (base) {
    case 'Varão': return 'varao';
    case 'Varão suíço': return 'varao_suico';
    case 'Trilho': return 'trilho';
    case 'Suporte':
    case 'Suporte duplo': return fixacao === 'varao_suico' ? 'suporte_varao_suico' : 'suporte_varao';
    case 'Ilhoses': return 'ilhos';
    case 'Argolas': return 'argola';
    case 'Rodízios/ganchos': return 'rodizio';
    case 'Ponteira': return 'ponteira';
    case 'Entretela (KOS)': return 'entretela';
    case 'Cordão wave':
    case 'Rodízio wave':
    case 'Base click':
    case 'Fita wave': return 'wave';
    case 'Terminais': return 'terminal';
    default: return null;
  }
}

// Itens OBRIGATÓRIOS do Wave (Victor v.4.1): o vendedor NÃO escolhe — o sistema resolve
// sozinho, pois há 1 produto fixo por item no grupo WAVE do GestãoClick (verificado:
// CORDÃO WAVE, RODIZIO WAVE, BASE CLICK WAVE, FITA WAVE AVULSA). Casa pelo nome.
const WAVE_FIXO_KEYWORD: Record<string, RegExp> = {
  'Cordão wave': /cord[ãa]o/i,
  'Rodízio wave': /rod[íi]zio/i,
  'Base click': /base\s*click/i,
  'Fita wave': /fita/i,
};

export function ehWaveFixo(item: string): boolean {
  return item in WAVE_FIXO_KEYWORD;
}

/** Resolve o produto fixo do GestãoClick para um item obrigatório do Wave (ou null). */
export async function resolverProdutoWaveFixo(item: string): Promise<AcessorioOpcao | null> {
  const re = WAVE_FIXO_KEYWORD[item];
  if (!re) return null;
  const { acessorios } = await listarAcessoriosCortina();
  return acessorios.wave?.find((p) => re.test(p.nome)) ?? null;
}
