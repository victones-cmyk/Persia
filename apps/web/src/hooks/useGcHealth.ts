// apps/web/src/hooks/useGcHealth.ts
// Polling do health check do GestãoClick a cada 30s (SRD §8, DS §7).

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type GcStatus = 'online' | 'offline' | 'checking';

interface GcHealthResponse {
  status: GcStatus;
  latency_ms: number;
  detail?: string;
}

const POLL_MS = 30_000;

export function useGcHealth() {
  const [status, setStatus] = useState<GcStatus>('checking');
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    let ativo = true;

    async function check() {
      try {
        const r = await api.get<GcHealthResponse>('/gc/health');
        if (!ativo) return;
        setStatus(r.status);
        setLatency(r.latency_ms);
      } catch {
        if (ativo) setStatus('offline');
      }
    }

    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  return { status, latency };
}
