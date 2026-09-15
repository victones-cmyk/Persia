// apps/api/src/services/gc/health.ts
// Health check do GestãoClick — GET /api/lojas como ping leve (SRD §11).
// Cache server-side de 5s para não martelar a API com o polling do frontend.

import { gcRequest, gcSomenteLeitura, temCredenciais } from './client';

/** 'leitura' = staging: le o GC real, gravacao desligada (ver gcSomenteLeitura). */
export type GcHealthStatus = 'online' | 'offline' | 'leitura' | 'checking';

export interface GcHealth {
  status: GcHealthStatus;
  latency_ms: number;
  detail?: string;
}

const CACHE_TTL_MS = 5000;
let cache: { value: GcHealth; expiresAt: number } | null = null;

export async function getGcHealth(): Promise<GcHealth> {
  const agora = Date.now();
  if (cache && cache.expiresAt > agora) return cache.value;

  let value: GcHealth;

  if (!temCredenciais()) {
    value = {
      status: 'offline',
      latency_ms: 0,
      detail: 'Credenciais GestãoClick não configuradas (preencher .env).',
    };
  } else {
    const inicio = Date.now();
    try {
      await gcRequest({ method: 'GET', url: '/api/lojas' });
      value = gcSomenteLeitura()
        ? { status: 'leitura', latency_ms: Date.now() - inicio, detail: 'Ambiente de teste: o GestãoClick é lido, nada é gravado nele.' }
        : { status: 'online', latency_ms: Date.now() - inicio };
    } catch {
      value = { status: 'offline', latency_ms: Date.now() - inicio, detail: 'GestãoClick inacessível.' };
    }
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
