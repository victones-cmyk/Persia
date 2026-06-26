// apps/api/src/services/gc/componentesPersiana.ts
// Preços dos COMPONENTES de persiana, lidos do GestãoClick pelo `codigo_interno`
// (Victor v.5.1: o preço de cada componente compõe o valor final da persiana, e ele
// referencia pelo código interno). Os componentes vivem nos grupos "ACESSÓRIOS DE
// PERSIANAS" (190128) e "ACESSÓRIOS" (76945) — verificado: os 60 códigos da planilha
// do Victor estão lá, com o preço VAREJO batendo. Índice cacheado (preço muda raro).

import { listarProdutos, type GcProduto } from './catalogos';

const GRUPOS_COMPONENTES = ['190128', '76945']; // ACESSÓRIOS DE PERSIANAS + ACESSÓRIOS
const VAREJO_TIPO_ID = '10969';
const TTL_MS = 5 * 60 * 1000; // 5 min — preço de componente muda raramente

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Preço de VENDA e CUSTO no tier VAREJO (com fallbacks). */
function precoCustoVarejo(p: GcProduto): { preco: number; custo: number } {
  const v = (p.valores ?? []).find((x) => x.tipo_id === VAREJO_TIPO_ID || x.nome_tipo === 'VAREJO');
  return {
    preco: num(v ? v.valor_venda : p.valor_venda),
    custo: num(v?.valor_custo),
  };
}

export interface PrecoComponente { nome: string; preco: number; custo: number }

let cache: { idx: Map<string, PrecoComponente>; expira: number } | null = null;

/** Índice codigo_interno → { nome, preço e custo VAREJO } dos componentes de persiana (cacheado). */
export async function indicePrecosComponentes(): Promise<Map<string, PrecoComponente>> {
  if (cache && cache.expira > Date.now()) return cache.idx;
  const idx = new Map<string, PrecoComponente>();
  for (const grupo of GRUPOS_COMPONENTES) {
    const produtos = await listarProdutos({ grupo_id: grupo, ativo: 1 });
    for (const p of produtos) {
      const ci = String(p.codigo_interno ?? '').trim();
      if (ci && !idx.has(ci)) {
        const { preco, custo } = precoCustoVarejo(p);
        idx.set(ci, { nome: p.nome, preco, custo });
      }
    }
  }
  cache = { idx, expira: Date.now() + TTL_MS };
  return idx;
}

export function invalidarCachePrecosComponentes(): void {
  cache = null;
}
