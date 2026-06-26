// apps/api/src/services/gc/instalacao.ts
// Tipos de INSTALAÇÃO lidos do GestãoClick (grupo "INSTALAÇÃO", id 5943859).
// Victor (26/06/2026): a instalação deixou de ser uma linha de SERVIÇO e passou a ser
// um COMPONENTE embutido no preço do produto. O vendedor escolhe o tipo POR ITEM
// (cada janela/cortina); o preço (venda + custo, tier VAREJO) é puxado daqui. A NF sai
// com o produto cujo valor final já soma tudo (tecido + acessórios + instalação).
// Índice cacheado (preço muda raramente).

import { listarProdutos, type GcProduto } from './catalogos';

const GRUPO_INSTALACAO = '5943859';
const VAREJO_TIPO_ID = '10969';
const TTL_MS = 5 * 60 * 1000; // 5 min

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

export interface TipoInstalacao { id: string; nome: string; preco: number; custo: number }

let cache: { lista: TipoInstalacao[]; idx: Map<string, TipoInstalacao>; expira: number } | null = null;

async function carregar(): Promise<{ lista: TipoInstalacao[]; idx: Map<string, TipoInstalacao> }> {
  if (cache && cache.expira > Date.now()) return cache;
  const produtos = await listarProdutos({ grupo_id: GRUPO_INSTALACAO, ativo: 1 });
  const lista: TipoInstalacao[] = [];
  const idx = new Map<string, TipoInstalacao>();
  for (const p of produtos) {
    const { preco, custo } = precoCustoVarejo(p);
    const t: TipoInstalacao = { id: String(p.id), nome: p.nome, preco, custo };
    lista.push(t);
    idx.set(t.id, t);
  }
  cache = { lista, idx, expira: Date.now() + TTL_MS };
  return cache;
}

/** Lista os tipos de instalação ativos (para o seletor da calculadora). */
export async function listarInstalacoes(): Promise<TipoInstalacao[]> {
  return (await carregar()).lista;
}

/** Índice id → tipo de instalação (para resolver o preço no cálculo e no envio). */
export async function indiceInstalacoes(): Promise<Map<string, TipoInstalacao>> {
  return (await carregar()).idx;
}

export function invalidarCacheInstalacoes(): void {
  cache = null;
}
