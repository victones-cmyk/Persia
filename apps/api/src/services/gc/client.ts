// apps/api/src/services/gc/client.ts
// Cliente HTTP do GestãoClick: axios + p-queue singleton (SRD §11).
// Rate limit da API: 3 req/s. Fila: concurrency 1, intervalCap 3, interval 1000ms.
// 429 é absorvido com retry automático pela fila (sem propagar ao usuário).

import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { env } from '../../config/env';

// p-queue é ESM-only. Este Function() evita que o tsc (CommonJS) converta o
// import() em require(), o que quebraria ao carregar um módulo ESM.
const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

let queuePromise: Promise<any> | null = null;
async function getQueue(): Promise<any> {
  if (!queuePromise) {
    queuePromise = dynamicImport('p-queue').then(
      (m) => new m.default({ concurrency: 1, intervalCap: 3, interval: 1000, carryoverConcurrencyCount: true }),
    );
  }
  return queuePromise;
}

export class GcError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'GcError';
  }
}

const http = axios.create({
  baseURL: env.GC_API_BASE_URL,
  timeout: env.GC_TIMEOUT_MS,
  headers: {
    access_token: env.GESTAOCLICK_ACCESS_TOKEN,
    secret_access_token: env.GESTAOCLICK_SECRET_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

function temCredenciais(): boolean {
  return env.GESTAOCLICK_ACCESS_TOKEN !== '' && env.GESTAOCLICK_SECRET_ACCESS_TOKEN !== '';
}

const MAX_RETRY_429 = 3;
const MAX_RETRY_5XX = 2;

function statusTemporario(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function respostaHtml(v: unknown): boolean {
  return typeof v === 'string' && /<html[\s>]|<!doctype html/i.test(v);
}

function hostCloudflare(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/<span[^>]*>\s*([^<]*\.[^<]*)\s*<\/span>\s*<h3[^>]*>[\s\S]*?Host/i);
  return m?.[1]?.trim() || null;
}

function detalheUsuario(status: number, detalhe: unknown): string {
  if (respostaHtml(detalhe)) {
    const host = hostCloudflare(detalhe);
    const alvo = host ? ` (${host})` : '';
    return `GestãoClick indisponível${alvo}: servidor retornou HTTP ${status}. Tente reenviar em alguns minutos.`;
  }
  if (typeof detalhe === 'string') return detalhe;
  return JSON.stringify(detalhe);
}

async function executar<T>(config: AxiosRequestConfig, tentativa = 0): Promise<T> {
  try {
    const res = await http.request<T>(config);
    if (env.GC_DEBUG_LOG) {
      console.log(`[gc] ${config.method?.toUpperCase()} ${config.url} → ${res.status}`);
    }
    return res.data;
  } catch (err) {
    const ax = err as AxiosError;
    const status = ax.response?.status ?? 0;

    // 429/5xx temporário: absorve e tenta de novo (a fila já espaça; backoff curto extra).
    if (status === 429 && tentativa < MAX_RETRY_429) {
      await new Promise((r) => setTimeout(r, 1000 * (tentativa + 1)));
      return executar<T>(config, tentativa + 1);
    }
    if (statusTemporario(status) && tentativa < MAX_RETRY_5XX) {
      await new Promise((r) => setTimeout(r, 1000 * (tentativa + 1)));
      return executar<T>(config, tentativa + 1);
    }

    const detalhe = ax.response?.data ?? ax.message;
    const metodo = config.method?.toUpperCase() ?? 'GET';
    const url = config.url ?? '';

    // Log obrigatório com payload completo antes de relançar.
    console.error(
      `[gc] ERRO ${status} em ${metodo} ${url}:`,
      JSON.stringify(detalhe),
    );
    throw new GcError(status, `${metodo} ${url}: ${detalheUsuario(status, detalhe)}`, {
      method: metodo,
      url,
      response: respostaHtml(ax.response?.data) ? detalheUsuario(status, ax.response?.data) : ax.response?.data ?? null,
    });
  }
}

/** Executa uma requisição ao GestãoClick através da fila de rate limit. */
export async function gcRequest<T>(config: AxiosRequestConfig): Promise<T> {
  if (!temCredenciais()) {
    throw new GcError(401, 'Credenciais GestãoClick não configuradas.');
  }
  const queue = await getQueue();
  return queue.add(() => executar<T>(config)) as Promise<T>;
}

/** Envelope padrão das respostas do GestãoClick. */
export interface GcEnvelope<T> {
  code: number;
  status: string;
  meta?: {
    total_registros: number;
    total_paginas: number;
    pagina_atual: number;
    proxima_pagina: number | null;
  };
  data: T;
}

export { temCredenciais };
