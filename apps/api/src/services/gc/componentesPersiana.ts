// apps/api/src/services/gc/componentesPersiana.ts
// Preços dos COMPONENTES de persiana, lidos do GestãoClick pelo `codigo_interno`
// (Victor v.5.1: o preço de cada componente compõe o valor final da persiana, e ele
// referencia pelo código interno). Os componentes vivem nos grupos "ACESSÓRIOS DE
// PERSIANAS" (190128) e "ACESSÓRIOS" (76945) — verificado: os 60 códigos da planilha
// do Victor estão lá, com o preço VAREJO batendo. Índice cacheado (preço muda raro).

import { listarProdutos, listarProdutosRemoto, type GcProduto } from './catalogos';

const GRUPOS_COMPONENTES = ['190128', '76945', '5969405']; // ACESSÓRIOS DE PERSIANAS + ACESSÓRIOS + BANDÔ DE VERTICAL

/** Grupo EMISSOR do GestãoClick (subgrupo de ACESSÓRIOS DE PERSIANAS/190128, já coberto
 * acima) — vendedor escolhe o produto no item motorizado (rolô/double vision/tela
 * solar) quando "Emissor: Sim" (Victor 01/08/2026). */
export const GRUPO_EMISSOR_PERSIANA = '6006913';
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

async function listarProdutosComponentes(grupo: string): Promise<GcProduto[]> {
  const produtos = await listarProdutos({ grupo_id: grupo, ativo: 1 });
  const temComponenteSemPreco = produtos.some((p) => {
    const ci = String(p.codigo_interno ?? '').trim();
    return ci && precoCustoVarejo(p).preco <= 0;
  });
  if (produtos.length > 0 && !temComponenteSemPreco) return produtos;

  try {
    return [...produtos, ...await listarProdutosRemoto({ grupo_id: grupo, ativo: 1 })];
  } catch {
    return produtos;
  }
}

// "id" é o ID do produto no GestãoClick (chave do PUT /produtos/{id} — usado
// na saída de estoque). "codigo_interno" é a chave de negócio que o resto do
// motor de preço usa pra casar componente da receita ↔ produto do catálogo.
export interface PrecoComponente { id: string; codigo_interno: string; nome: string; preco: number; custo: number }

let cache: { idx: Map<string, PrecoComponente>; expira: number } | null = null;

/** Índice codigo_interno → { id, nome, preço e custo VAREJO } dos componentes de persiana (cacheado). */
export async function indicePrecosComponentes(): Promise<Map<string, PrecoComponente>> {
  if (cache && cache.expira > Date.now()) return cache.idx;
  const idx = new Map<string, PrecoComponente>();
  for (const grupo of GRUPOS_COMPONENTES) {
    const produtos = await listarProdutosComponentes(grupo);
    for (const p of produtos) {
      const ci = String(p.codigo_interno ?? '').trim();
      if (ci) {
        const { preco, custo } = precoCustoVarejo(p);
        const atual = idx.get(ci);
        if (!atual || (atual.preco <= 0 && preco > 0)) {
          idx.set(ci, { id: String(p.id), codigo_interno: ci, nome: p.nome, preco, custo });
        }
        idx.set(String(p.id), { id: String(p.id), codigo_interno: ci, nome: p.nome, preco, custo });
      }
    }
  }
  cache = { idx, expira: Date.now() + TTL_MS };
  return idx;
}

export function invalidarCachePrecosComponentes(): void {
  cache = null;
}
