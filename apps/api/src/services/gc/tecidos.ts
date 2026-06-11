// apps/api/src/services/gc/tecidos.ts
// Tecidos reais do GestãoClick (substitui tecidos.mock.ts — Fase 4).
//
// DECISÕES (verificadas via API em 11/06/2026 — confirmar com Victor):
//  • Não existe campo `dimensao` nem `largura` preenchido no produto. A largura do
//    rolo está no NOME (ex: "...3.00M..."). Parseada por regex; sem metragem → tecido
//    é ignorado na lista (não dá para validar RN-01 sem dimensão).
//  • Preço (CONFIRMADO por Victor 11/06/2026): PERSIANAS usam tabela VAREJO (10969)
//    para todos os componentes. CORTINAS (Fase 7) usam SOB MEDIDA (230813) APENAS para
//    tecidos; trilhos/acessórios/demais componentes de cortina usam VAREJO. Use
//    precoByTier(produto, tier) com o tier correto conforme o contexto. Fallback: valor_venda.
//  • Tecidos não são agrupados por trama no GC (tudo em TECIDO 76944). Filtramos por
//    palavra-chave da trama (BLACKOUT/SCREEN/TRANSLUC/DOUBLE) derivada do tipo; se a
//    filtragem não achar nada, devolve todos os tecidos com dimensão.

import { listarProdutos, GRUPO_TECIDO_ID, type GcProduto } from './catalogos';
import type { TipoPersiana } from '../calc/tipos';

export interface TecidoGc {
  id: string;
  nome: string;
  dimensao_m: number;
  preco_venda: number;
  preco_custo: number;
}

// Tabelas de preço do GestãoClick (GET /api/produtos → valores[].tipo_id).
export const VAREJO_TIPO_ID = '10969';
export const SOB_MEDIDA_TIPO_ID = '230813';

/** Tier de preço por contexto. Persiana sempre 'varejo' (regra Victor 11/06/2026). */
export type PriceTier = 'varejo' | 'sob_medida';

const TIER_ID: Record<PriceTier, string> = {
  varejo: VAREJO_TIPO_ID,
  sob_medida: SOB_MEDIDA_TIPO_ID,
};
const TIER_NOME: Record<PriceTier, string> = {
  varejo: 'VAREJO',
  sob_medida: 'SOB MEDIDA',
};

const PALAVRA_TRAMA: Record<TipoPersiana, string> = {
  persiana_rolo_blackout: 'BLACKOUT',
  persiana_romana_blackout: 'BLACKOUT',
  persiana_rolo_screen: 'SCREEN',
  persiana_romana_screen: 'SCREEN',
  persiana_rolo_translucido: 'TRANSLUC',
  persiana_romana_translucido: 'TRANSLUC',
  persiana_rolo_double_vision: 'DOUBLE',
};

const DIM_RE = /(\d+[.,]\d{1,2})\s*M\b/i;

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
}

/** Extrai a dimensão (largura do rolo, m) do nome. null se não houver metragem plausível. */
export function parseDimensao(nome: string): number | null {
  const m = DIM_RE.exec(nome);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  // Largura de rolo plausível: entre 1,0m e 4,0m.
  return v >= 1 && v <= 4 ? v : null;
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

// Cache server-side dos tecidos por tier (a base muda pouco; evita refetch de 5 páginas).
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<PriceTier, { tecidos: TecidoGc[]; expiresAt: number }>();

async function todosTecidos(tier: PriceTier): Promise<TecidoGc[]> {
  const atual = cache.get(tier);
  if (atual && atual.expiresAt > Date.now()) return atual.tecidos;

  const produtos = await listarProdutos({ grupo_id: GRUPO_TECIDO_ID, ativo: 1 });
  const tecidos: TecidoGc[] = [];
  for (const p of produtos) {
    const dimensao = parseDimensao(p.nome);
    if (dimensao === null) continue; // sem dimensão não dá para usar (RN-01)
    const preco = precoByTier(p, tier);
    tecidos.push({
      id: p.id,
      nome: p.nome,
      dimensao_m: dimensao,
      preco_venda: preco.venda,
      preco_custo: preco.custo,
    });
  }
  cache.set(tier, { tecidos, expiresAt: Date.now() + CACHE_TTL_MS });
  return tecidos;
}

/**
 * Tecidos para um tipo de persiana, filtrados pela palavra-chave da trama.
 * Persiana usa SEMPRE a tabela VAREJO (regra Victor). Cortina (Fase 7) deverá
 * chamar todosTecidos('sob_medida') para tecidos e VAREJO para os demais componentes.
 */
export async function tecidosParaTipo(tipo: TipoPersiana): Promise<TecidoGc[]> {
  const todos = await todosTecidos('varejo');
  const palavra = PALAVRA_TRAMA[tipo];
  const filtrados = todos.filter((t) => semAcento(t.nome).includes(palavra));
  // Se a heurística de trama não achar nada, devolve todos (vendedor escolhe).
  return filtrados.length > 0 ? filtrados : todos;
}

/** Busca um tecido pelo id. tier padrão 'varejo' (persiana). */
export async function buscarTecidoGc(id: string, tier: PriceTier = 'varejo'): Promise<TecidoGc | undefined> {
  const todos = await todosTecidos(tier);
  return todos.find((t) => t.id === id);
}

export function invalidarCacheTecidos(): void {
  cache.clear();
}
