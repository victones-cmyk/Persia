// apps/api/src/services/agenda/agendaApi.ts
// Cliente HTTP da API de integração do app Agenda. Diferente de agendaDb.ts,
// que LÊ o banco do Agenda direto, aqui a Pérsia ESCREVE — e escrita passa
// pela API dele, que é o dono das regras (checklist, push para o instalador,
// validações). A Pérsia nunca insere na tabela do outro app.
//
// Autenticação por chave dedicada (x-api-key), não por usuário: é chamada
// máquina-a-máquina. Sem AGENDA_API_KEY configurada a criação fica desligada
// e o resto da integração (leitura) continua funcionando normalmente.

import { env } from '../../config/env';

export interface TecnicoAgenda {
  id: number;
  name: string;
}

export interface AmbienteParaAgenda {
  /** Identidade compartilhada do ambiente. Quem cria primeiro cunha; o outro lado respeita. */
  id: string;
  nome: string;
  largura?: number | null;
  altura?: number | null;
  folhas_sugeridas?: number | null;
  observacao?: string | null;
  /** O que o vendedor já sabe que vai neste ambiente — é o que diz ao técnico o que medir. */
  tipos_produto?: ('persiana' | 'cortina')[];
  trilho_especial?: boolean;
}

export interface NovaOsAgenda {
  tipo: 'measurement' | 'installation' | 'return' | 'warranty';
  tecnico_id?: number | null;
  cliente_nome: string;
  cliente_endereco?: string | null;
  cliente_telefone?: string | null;
  cliente_cep?: string | null;
  cliente_numero?: string | null;
  cliente_complemento?: string | null;
  vendedor?: string | null;
  pedido_codigo?: string | null;
  agendado_para?: string | null;
  observacoes?: string | null;
  ambientes?: AmbienteParaAgenda[];
}

export interface OsCriada {
  id: number;
  type: string;
  status: string;
  client_name: string;
}

export class AgendaApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AgendaApiError';
  }
}

export function agendaApiHabilitada(): boolean {
  return env.AGENDA_API_KEY.trim() !== '';
}

const TIMEOUT_MS = 15_000;

async function chamar<T>(caminho: string, init: RequestInit): Promise<T> {
  if (!agendaApiHabilitada()) {
    throw new AgendaApiError(503, 'A criação de OS no Agenda não está configurada neste servidor.');
  }
  const url = env.AGENDA_BASE_URL.replace(/\/+$/, '') + caminho;
  // AbortSignal.timeout evita que o Agenda fora do ar segure a requisição do
  // vendedor até o timeout do navegador.
  const resposta = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.AGENDA_API_KEY,
      'x-origem': 'persia',
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: Error) => {
    throw new AgendaApiError(0, `Não foi possível falar com o Agenda: ${e.message}`);
  });

  const corpo = await resposta.text();
  if (!resposta.ok) {
    let msg = corpo.slice(0, 300);
    try {
      const j = JSON.parse(corpo) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* resposta não-JSON: usa o texto cru */ }
    throw new AgendaApiError(resposta.status, msg || `Agenda respondeu ${resposta.status}`);
  }
  return JSON.parse(corpo) as T;
}

/**
 * Cria uma OS no Agenda a partir de um orçamento/venda da Pérsia, já com os
 * ambientes nomeados pelo vendedor — o técnico só completa as medidas em campo.
 */
export function criarOsNoAgenda(os: NovaOsAgenda): Promise<OsCriada> {
  return chamar<OsCriada>('/api/integracao/appointments', {
    method: 'POST',
    body: JSON.stringify({
      type: os.tipo,
      client_name: os.cliente_nome,
      client_address: os.cliente_endereco ?? '',
      client_phone: os.cliente_telefone ?? '',
      client_zip: os.cliente_cep ?? '',
      client_number: os.cliente_numero ?? '',
      client_complement: os.cliente_complemento ?? '',
      seller: os.vendedor ?? '',
      assigned_to: os.tecnico_id ?? null,
      order_number: os.pedido_codigo ?? '',
      scheduled_at: os.agendado_para ?? '',
      notes: os.observacoes ?? '',
      ambientes: (os.ambientes ?? []).map((a) => ({
        id: a.id,
        name: a.nome,
        largura: a.largura ?? null,
        altura: a.altura ?? null,
        folhas_sugeridas: a.folhas_sugeridas ?? null,
        info: a.observacao ?? '',
        tipos_produto: a.tipos_produto ?? [],
        trilho_especial: a.trilho_especial === true,
      })),
    }),
  });
}

/** Técnicos que podem receber a OS — para o vendedor já atribuir ao agendar. */
export async function listarTecnicosDoAgenda(): Promise<TecnicoAgenda[]> {
  const r = await chamar<{ tecnicos: TecnicoAgenda[] }>('/api/integracao/tecnicos', { method: 'GET' });
  return r.tecnicos ?? [];
}
