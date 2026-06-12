// apps/api/src/services/gc/orcamentos.ts
// Escrita de orçamentos no GestãoClick (SRD §11, Fase 5).
// Linha única: quantidade 1 × valor_venda = valor_final → total exato (RN-10).

import { gcRequest, type GcEnvelope } from './client';

// Situação "Em aberto" (GET /api/situacoes_orcamentos — verificado 11/06/2026).
export const SITUACAO_EM_ABERTO = '92112';

export interface NovoOrcamentoGc {
  codigo: number; // timestamp unix (int)
  cliente_id: string;
  gc_produto_id: string;
  valor_final: number;
  valor_custo: number;
  data: string; // YYYY-MM-DD
  usuario_id?: string | null; // usuário de login/integração (omitido → usuário master)
  vendedor_id?: string | null; // vendedor (cadastro de funcionários) atribuído ao orçamento
  loja_id?: string | null; // gc_loja_id
}

interface OrcamentoCriado {
  id: string;
}

export interface ResultadoOrcamento {
  gc_orcamento_id: string;
  payload: Record<string, unknown>;
  resposta: unknown;
}

function montarPayload(o: NovoOrcamentoGc): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tipo: 'produto',
    codigo: o.codigo,
    cliente_id: o.cliente_id,
    situacao_id: SITUACAO_EM_ABERTO,
    data: o.data,
    produtos: [
      {
        produto_id: o.gc_produto_id,
        quantidade: 1,
        valor_venda: o.valor_final,
        valor_custo: o.valor_custo,
      },
    ],
  };
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
  return { gc_orcamento_id, payload, resposta: env };
}

export async function deletarOrcamento(id: string): Promise<void> {
  await gcRequest({ method: 'DELETE', url: `/api/orcamentos/${id}` });
}
