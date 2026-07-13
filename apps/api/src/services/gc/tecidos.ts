// apps/api/src/services/gc/tecidos.ts
// Tecidos reais do GestãoClick.
//
// DECISÕES (confirmadas com Victor em 11/06/2026):
//  • CATEGORIAS: a calculadora de PERSIANA usa o grupo "TECIDOS PARA PERSIANA" (235486);
//    a de CORTINA (Fase 7) usa o grupo "TECIDO" (76944).
//  • LARGURA do rolo: lida do CAMPO `largura` do produto (Victor vai preencher cada tecido).
//    Fallback temporário: parse do nome ("...2,80M..."), enquanto as larguras não estão
//    todas preenchidas. Tecido sem largura (campo vazio E sem metragem no nome) fica de fora.
//  • PREÇO: PERSIANA usa VAREJO (10969). CORTINA usa SOB MEDIDA (230813) só no tecido e
//    VAREJO nos demais componentes. Use precoByTier(produto, tier).

import { listarProdutos, type GcProduto } from './catalogos';
import type { TipoPersiana } from '../calc/tipos';
import { encontrarCalculadora, getCalculadoras } from '../calc/calculadoras';

export interface TecidoGc {
  id: string;
  nome: string;
  dimensao_m: number;
  preco_venda: number;
  preco_custo: number;
  grupo_id: string; // subgrupo no GC (usado p/ filtrar por tipo de persiana)
}

// Grupos de produto no GestãoClick (GET /api/grupos_produtos).
export const GRUPO_TECIDOS_PERSIANA = '235486'; // "TECIDOS PARA PERSIANA" (inclui subgrupos)

// Subgrupos de "TECIDOS PARA PERSIANA" por MATERIAL (verificado no GC 19/06/2026).
// Rolo e Romana compartilham o mesmo material — o filtro é por material, não por família.
// "PERSIANA FD" (5914919) é grupo CORINGA do Victor (movimentação de estoque) e
// NÃO deve aparecer na calculadora (Victor 19/06/2026) → filtro estrito pelos 4 materiais.
export const SUBGRUPO_PERSIANA = {
  blackout: '5914897', // BLACKOUT
  screen: '5914896', // TELA SOLAR
  translucido: '5914898', // TRANSLÚCIDO
  double_vision: '5914899', // DOUBLE VISION
} as const;

const SUBGRUPO_DO_TIPO: Record<TipoPersiana, string> = {
  persiana_rolo_blackout: SUBGRUPO_PERSIANA.blackout,
  persiana_rolo_screen: SUBGRUPO_PERSIANA.screen,
  persiana_rolo_translucido: SUBGRUPO_PERSIANA.translucido,
  persiana_rolo_double_vision: SUBGRUPO_PERSIANA.double_vision,
  persiana_romana_blackout: SUBGRUPO_PERSIANA.blackout,
  persiana_romana_screen: SUBGRUPO_PERSIANA.screen,
  persiana_romana_translucido: SUBGRUPO_PERSIANA.translucido,
};
// "TECIDOS PARA CORTINA" — grupo PAI que já engloba todos (Victor 15/06/2026).
// O filtro grupo_id retorna também os descendentes (ex.: BOOKS TEXHAUS 5829560).
export const GRUPO_TECIDO_CORTINA = '5913111';

// Tabelas de preço (GET /api/produtos → valores[].tipo_id).
export const VAREJO_TIPO_ID = '10969';
export const SOB_MEDIDA_TIPO_ID = '230813';

/** Tier de preço por contexto. Persiana sempre 'varejo' (regra Victor). */
export type PriceTier = 'varejo' | 'sob_medida';

const TIER_ID: Record<PriceTier, string> = {
  varejo: VAREJO_TIPO_ID,
  sob_medida: SOB_MEDIDA_TIPO_ID,
};
const TIER_NOME: Record<PriceTier, string> = {
  varejo: 'VAREJO',
  sob_medida: 'SOB MEDIDA',
};

const DIM_RE = /(\d+[.,]\d{1,2})\s*M\b/i;

function larguraValida(v: number): boolean {
  return Number.isFinite(v) && v >= 1 && v <= 4;
}

/**
 * Largura do rolo (m). Ordem de prioridade (verificado no GestãoClick 12/06/2026):
 *  1) campo extra/atributo "LARGURA" (onde o Victor cadastra de fato);
 *  2) campo nativo `largura` (hoje vem vazio, mas pode ser usado no futuro);
 *  3) parse do nome ("...2,80M..."), fallback legado.
 * Retorna null se nenhuma fonte tiver uma largura válida (1–4 m).
 */
export function dimensaoDoProduto(p: GcProduto): number | null {
  for (const a of p.atributos ?? []) {
    const desc = String(a?.atributo?.descricao ?? '').trim().toUpperCase();
    if (desc.startsWith('LARGURA')) {
      const v = Number(String(a.atributo.conteudo ?? '').replace(',', '.').trim());
      if (larguraValida(v)) return v;
    }
  }
  const campo = Number(String(p.largura ?? '').replace(',', '.'));
  if (larguraValida(campo)) return campo;
  const m = DIM_RE.exec(p.nome);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (larguraValida(v)) return v;
  }
  return null;
}

/** Preço (venda/custo) de um produto na tabela indicada. Fallback: valor_venda padrão. */
export function precoByTier(p: GcProduto, tier: PriceTier): { venda: number; custo: number } {
  const v = p.valores?.find((x) => x.tipo_id === TIER_ID[tier] || x.nome_tipo === TIER_NOME[tier]);
  const venda = Number(v ? v.valor_venda : p.valor_venda);
  const custo = Number(v ? v.valor_custo : p.valor_venda);
  return {
    venda: Number.isFinite(venda) ? venda : 0,
    custo: Number.isFinite(custo) ? custo : 0,
  };
}

// Cache server-side dos tecidos de persiana (curto: novos tecidos do GC aparecem em até 1 min).
const CACHE_TTL_MS = 60 * 1000;
let cache: { tecidos: TecidoGc[]; expiresAt: number } | null = null;
const cachePorGrupo = new Map<string, { tecidos: TecidoGc[]; expiresAt: number }>();

function produtoParaTecido(p: GcProduto, exigirLargura = true): TecidoGc | null {
  const dimensao = dimensaoDoProduto(p);
  if (dimensao === null && exigirLargura) return null;
  const preco = precoByTier(p, 'varejo');
  return {
    id: p.id,
    nome: p.nome,
    dimensao_m: dimensao ?? 0,
    preco_venda: preco.venda,
    preco_custo: preco.custo,
    grupo_id: String(p.grupo_id ?? ''),
  };
}

async function tecidosDoGrupo(grupoId: string, exigirLargura = true): Promise<TecidoGc[]> {
  const cacheKey = `${grupoId}:${exigirLargura ? 'largura' : 'sem_largura'}`;
  const cached = cachePorGrupo.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.tecidos;

  const produtos = await listarProdutos({ grupo_id: grupoId, ativo: 1 });
  const tecidos = produtos.map((p) => produtoParaTecido(p, exigirLargura)).filter((t): t is TecidoGc => t !== null);
  cachePorGrupo.set(cacheKey, { tecidos, expiresAt: Date.now() + CACHE_TTL_MS });
  return tecidos;
}

async function tecidosDosGrupos(grupoIds: string[], exigirLargura = true): Promise<TecidoGc[]> {
  const grupos = [...new Set(grupoIds.map((g) => String(g).trim()).filter(Boolean))];
  const todos = (await Promise.all(grupos.map((grupoId) => tecidosDoGrupo(grupoId, exigirLargura)))).flat();
  const porId = new Map<string, TecidoGc>();
  for (const tecido of todos) porId.set(tecido.id, tecido);
  return [...porId.values()];
}

/** Todos os tecidos de PERSIANA (grupo 235486), preço VAREJO. */
async function tecidosPersiana(): Promise<TecidoGc[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.tecidos;

  const produtos = await listarProdutos({ grupo_id: GRUPO_TECIDOS_PERSIANA, ativo: 1 });
  const tecidos = produtos.map((p) => produtoParaTecido(p)).filter((t): t is TecidoGc => t !== null);
  cache = { tecidos, expiresAt: Date.now() + CACHE_TTL_MS };
  return tecidos;
}

/**
 * Tecidos para a calculadora de persiana, FILTRADOS pelo material do tipo escolhido
 * (Victor: ao escolher "Blackout" mostrar só blackout, etc.). Filtro estrito: só os
 * 4 subgrupos de material. O grupo coringa "PERSIANA FD" fica de fora (Victor 19/06).
 */
export async function tecidosParaTipo(tipo: TipoPersiana): Promise<TecidoGc[]> {
  const calc = encontrarCalculadora(tipo);
  if (calc?.tecido_grupo_ids?.length) {
    return tecidosDosGrupos(calc.tecido_grupo_ids, calc.largura_tecido_obrigatoria !== false);
  }
  const todos = await tecidosPersiana();
  const subgrupo = SUBGRUPO_DO_TIPO[tipo];
  return todos.filter((t) => t.grupo_id === subgrupo);
}

/** Busca um tecido de persiana pelo id. */
export async function buscarTecidoGc(id: string, tipo?: TipoPersiana | null): Promise<TecidoGc | undefined> {
  const calc = tipo ? encontrarCalculadora(tipo) : undefined;
  const gruposConfigurados = calc?.tecido_grupo_ids?.length
    ? calc.tecido_grupo_ids
    : getCalculadoras().flatMap((c) => c.tecido_grupo_ids ?? []);
  const exigirLargura = calc ? calc.largura_tecido_obrigatoria !== false : false;
  const todos = [...await tecidosPersiana(), ...await tecidosDosGrupos(gruposConfigurados, exigirLargura)];
  return todos.find((t) => t.id === id);
}

// Cache separado dos tecidos de cortina (grupo pai 5913111, preço SOB MEDIDA).
let cacheCortina: { tecidos: TecidoGc[]; expiresAt: number } | null = null;

/** Tecidos de CORTINA (grupo pai "TECIDOS PARA CORTINA", inclui descendentes), preço SOB MEDIDA. */
export async function tecidosCortina(): Promise<TecidoGc[]> {
  if (cacheCortina && cacheCortina.expiresAt > Date.now()) return cacheCortina.tecidos;

  const produtos = await listarProdutos({ grupo_id: GRUPO_TECIDO_CORTINA, ativo: 1 });
  const tecidos: TecidoGc[] = [];
  for (const p of produtos) {
    const dimensao = dimensaoDoProduto(p);
    if (dimensao === null) continue; // sem largura não dá para calcular
    const preco = precoByTier(p, 'sob_medida');
    tecidos.push({
      id: p.id,
      nome: p.nome,
      dimensao_m: dimensao,
      preco_venda: preco.venda,
      preco_custo: preco.custo,
      grupo_id: String(p.grupo_id ?? ''),
    });
  }
  cacheCortina = { tecidos, expiresAt: Date.now() + CACHE_TTL_MS };
  return tecidos;
}

/** Busca um tecido de cortina pelo id. */
export async function buscarTecidoCortinaGc(id: string): Promise<TecidoGc | undefined> {
  const todos = await tecidosCortina();
  return todos.find((t) => t.id === id);
}

export function invalidarCacheTecidos(): void {
  cache = null;
  cacheCortina = null;
  cachePorGrupo.clear();
}
