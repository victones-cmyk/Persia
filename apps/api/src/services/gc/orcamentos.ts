// apps/api/src/services/gc/orcamentos.ts
// Escrita de orçamentos no GestãoClick (SRD §11, Fase 5).
// Cada item sob medida é uma linha de quantidade 1. Produtos avulsos mantêm
// sua quantidade real e usam valor_venda/valor_custo unitários (RN-10).

import { gcRequest, type GcEnvelope } from './client';

// Situação "Em aberto" (GET /api/situacoes_orcamentos — verificado 11/06/2026).
export const SITUACAO_EM_ABERTO = '92112';
/** Virou venda. */
export const SITUACAO_CONCRETIZADO = '92114';
/** Refeito após remedição — distinto de cancelado, que é desistência do cliente. */
export const SITUACAO_SUBSTITUIDO = '9442250';

/** Uma linha de produto do orçamento. */
export interface LinhaProdutoGc {
  gc_produto_id: string;
  valor_venda: number; // valor unitário (com desconto)
  valor_custo: number;
  quantidade?: number; // default 1
}

/** Uma linha de serviço do orçamento (ex.: instalação). Instalação é por peça:
 * valor_venda = valor unitário; quantidade = nº de peças (cortinas/janelas). */
export interface LinhaServicoGc {
  gc_servico_id: string;
  valor_venda: number;
  quantidade?: number; // default 1
}

export interface NovoOrcamentoGc {
  // NÃO enviamos "codigo": o GestãoClick gera o número SEQUENCIAL dele (Victor 18/06).
  // Enviar um número (ex.: timestamp) fura a sequência. O nº gerado volta na resposta.
  cliente_id: string;
  produtos: LinhaProdutoGc[]; // uma linha por item do orçamento
  servicos?: LinhaServicoGc[]; // linhas de serviço (ex.: instalação)
  data: string; // YYYY-MM-DD
  usuario_id?: string | null; // usuário de login/integração (omitido → usuário master)
  vendedor_id?: string | null; // vendedor (cadastro de funcionários) atribuído ao orçamento
  loja_id?: string | null; // gc_loja_id
}

interface OrcamentoCriado {
  id: string;
  codigo?: string; // nº sequencial gerado pelo GestãoClick
}

export interface ResultadoOrcamento {
  gc_orcamento_id: string;
  gc_codigo: string | null; // nº sequencial devolvido pelo GestãoClick
  payload: Record<string, unknown>;
  resposta: unknown;
}

export function montarPayload(o: NovoOrcamentoGc): Record<string, unknown> {
  const temProduto = o.produtos.length > 0;
  const servicos = o.servicos ?? [];
  const temServico = servicos.length > 0;
  // tipo do orçamento no GestãoClick: produto, serviço ou ambos.
  const tipo = temProduto && temServico ? 'ambos' : temServico ? 'servico' : 'produto';

  const payload: Record<string, unknown> = {
    tipo,
    cliente_id: o.cliente_id,
    situacao_id: SITUACAO_EM_ABERTO,
    data: o.data,
    produtos: o.produtos.map((p) => ({
      produto_id: p.gc_produto_id,
      quantidade: p.quantidade ?? 1,
      valor_venda: p.valor_venda,
      valor_custo: p.valor_custo,
    })),
  };
  if (temServico) {
    payload.servicos = servicos.map((s) => ({
      servico_id: s.gc_servico_id,
      quantidade: s.quantidade ?? 1,
      valor_venda: s.valor_venda,
    }));
  }
  if (o.usuario_id) payload.usuario_id = o.usuario_id;
  if (o.vendedor_id) payload.vendedor_id = o.vendedor_id;
  if (o.loja_id) payload.loja_id = o.loja_id;
  return payload;
}

export async function criarOrcamento(o: NovoOrcamentoGc): Promise<ResultadoOrcamento> {
  const payload = montarPayload(o);
  const env = await gcRequest<GcEnvelope<OrcamentoCriado>>({
    method: 'POST',
    url: '/api/orcamentos',
    data: payload,
  });
  const gc_orcamento_id = env.data?.id;
  if (!gc_orcamento_id) {
    throw new Error('GestãoClick não retornou o id do orçamento.');
  }
  return { gc_orcamento_id, gc_codigo: env.data?.codigo ?? null, payload, resposta: env };
}

/**
 * Muda a situação de um orçamento já criado no GestãoClick.
 *
 * O PUT do GC não aceita alteração parcial: exige o orçamento inteiro, e recusa
 * (com um 404 que na verdade é validação) se o total dos produtos não bater com o
 * das parcelas. Por isso reenviamos o payload original — o mesmo que criou o
 * orçamento, guardado em `payload_gc_enviado` — trocando só a situação.
 *
 * Sem o payload original não há como montar o PUT; nesse caso devolve false em
 * vez de estourar, porque marcar situação é acabamento e não pode derrubar a
 * operação de verdade (gerar venda, por exemplo).
 */
export async function atualizarSituacaoOrcamento(args: {
  gc_orcamento_id: string;
  gc_codigo: string | null;
  situacao_id: string;
  payload_original: unknown;
}): Promise<boolean> {
  const original = args.payload_original;
  if (!original || typeof original !== 'object' || Array.isArray(original)) return false;
  if (!args.gc_codigo) return false;

  const payload = { ...(original as Record<string, unknown>), codigo: args.gc_codigo, situacao_id: args.situacao_id };
  await gcRequest({
    method: 'PUT',
    url: `/api/orcamentos/${encodeURIComponent(args.gc_orcamento_id)}`,
    data: payload,
  });
  return true;
}

export async function deletarOrcamento(id: string): Promise<void> {
  await gcRequest({ method: 'DELETE', url: `/api/orcamentos/${encodeURIComponent(id)}` });
}
