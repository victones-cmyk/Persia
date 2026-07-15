import { gcRequest, type GcEnvelope } from './client';

interface VendaCriada {
  id: string;
  codigo?: string;
}

export interface ResultadoVenda {
  gc_pedido_id: string;
  gc_pedido_codigo: string | null;
  payload: Record<string, unknown>;
  resposta: unknown;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function produtoVenda(v: unknown): Record<string, unknown> {
  const p = objeto(v);
  const id = p.produto_id ?? p.id;
  return {
    ...p,
    ...(id ? { produto_id: id } : {}),
  };
}

function servicoVenda(v: unknown): Record<string, unknown> {
  const s = objeto(v);
  const id = s.servico_id ?? s.id;
  return {
    ...s,
    ...(id ? { servico_id: id } : {}),
  };
}

const CAMPOS_OBSERVACOES_CONTRATO = [
  'observacoes',
  'observacao',
  'observacoes_internas',
  'observacao_interna',
  'observacoes_contrato',
  'observacao_contrato',
  'contrato_observacoes',
  'texto_contrato',
  'contrato',
  'termos',
  'termos_contrato',
  'informacoes_adicionais',
];

function valorPreenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  return typeof v !== 'string' || v.trim().length > 0;
}

function copiarObservacoesContrato(payload: Record<string, unknown>, origem: Record<string, unknown>): void {
  for (const campo of CAMPOS_OBSERVACOES_CONTRATO) {
    const valor = origem[campo];
    if (valorPreenchido(valor)) payload[campo] = valor;
  }
}

export function montarPayloadVenda(payloadOrcamento: unknown, orcamentoGcAtual?: unknown): Record<string, unknown> {
  const origem = objeto(payloadOrcamento);
  const remoto = objeto(orcamentoGcAtual);
  const produtos = Array.isArray(origem.produtos) ? origem.produtos : [];
  const servicos = Array.isArray(origem.servicos) ? origem.servicos : [];

  const payload: Record<string, unknown> = {
    ...origem,
    // Não enviamos "codigo": o GestãoClick gera o próximo número sequencial da venda.
    tipo: origem.tipo === 'ambos' ? 'produto' : origem.tipo ?? 'produto',
    produtos: produtos.map((p) => ({ produto: produtoVenda(p) })),
  };

  delete payload.codigo;
  delete payload.id;
  delete payload.hash;

  copiarObservacoesContrato(payload, origem);
  copiarObservacoesContrato(payload, remoto);

  if (servicos.length > 0) {
    payload.servicos = servicos.map((s) => ({ servico: servicoVenda(s) }));
  } else {
    delete payload.servicos;
  }

  return payload;
}

export async function criarVendaDePayload(payloadOrcamento: unknown, orcamentoGcAtual?: unknown): Promise<ResultadoVenda> {
  const payload = montarPayloadVenda(payloadOrcamento, orcamentoGcAtual);
  return criarVendaComPayload(payload);
}

export async function criarVendaComPayload(payload: Record<string, unknown>): Promise<ResultadoVenda> {
  const env = await gcRequest<GcEnvelope<VendaCriada>>({
    method: 'POST',
    url: '/api/vendas',
    data: payload,
  });
  const gc_pedido_id = env.data?.id;
  if (!gc_pedido_id) {
    throw new Error('GestãoClick não retornou o id da venda.');
  }
  return {
    gc_pedido_id,
    gc_pedido_codigo: env.data?.codigo ?? null,
    payload,
    resposta: env,
  };
}
