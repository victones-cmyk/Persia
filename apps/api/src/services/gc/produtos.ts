// apps/api/src/services/gc/produtos.ts
// Escrita de produtos no GestãoClick (SRD §11, Fase 5).
// Cada orçamento cria um produto que representa a persiana configurada, com o
// valor já calculado. codigo_interno = "PERSIA-{timestamp}".

import { gcRequest, type GcEnvelope } from './client';

// Tier de preço dos produtos de persiana criados: VAREJO (regra Victor 11/06/2026).
import { VAREJO_TIPO_ID } from './tecidos';

export interface NovoProdutoGc {
  nome: string;
  valor_custo: number;
  valor_venda: number;
}

interface ProdutoCriado {
  id: string;
}

export interface ResultadoProduto {
  gc_produto_id: string;
  codigo_interno: string;
  payload: Record<string, unknown>;
}

export async function criarProduto(p: NovoProdutoGc): Promise<ResultadoProduto> {
  const codigo_interno = `PERSIA-${Math.floor(Date.now() / 1000)}`;
  const payload = {
    nome: p.nome,
    codigo_interno,
    valor_custo: p.valor_custo,
    movimenta_estoque: 0, // produto sintético do orçamento — não controla estoque
    valores: [{ tipo_id: VAREJO_TIPO_ID, valor_venda: p.valor_venda }],
  };

  const env = await gcRequest<GcEnvelope<ProdutoCriado>>({
    method: 'POST',
    url: '/api/produtos',
    data: payload,
  });

  const gc_produto_id = env.data?.id;
  if (!gc_produto_id) {
    throw new Error('GestãoClick não retornou o id do produto.');
  }
  return { gc_produto_id, codigo_interno, payload };
}

export async function deletarProduto(id: string): Promise<void> {
  await gcRequest({ method: 'DELETE', url: `/api/produtos/${encodeURIComponent(id)}` });
}
