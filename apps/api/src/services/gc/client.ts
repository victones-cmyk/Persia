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

    // 429: absorve e tenta de novo (a fila já espaça; backoff curto extra).
    if (status === 429 && tentativa < MAX_RETRY_429) {
      await new Promise((r) => setTimeout(r, 1000 * (tentativa + 1)));
      return executar<T>(config, tentativa + 1);
    }

    // Log obrigatório com payload completo antes de relançar.
    console.error(
      `[gc] ERRO ${status} em ${config.method?.toUpperCase()} ${config.url}:`,
      JSON.stringify(ax.response?.data ?? ax.message),
    );
    throw new GcError(status, ax.message, ax.response?.data);
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
