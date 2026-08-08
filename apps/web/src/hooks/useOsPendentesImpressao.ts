// apps/web/src/hooks/useOsPendentesImpressao.ts
// Polling da quantidade de OS geradas e ainda não impressas — mesma ideia do
// useAprovacoesPendentes, pra sinalizar no menu "Produção" sem precisar abrir a
// tela pra descobrir que há etiqueta pendente.

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const POLL_MS = 60_000;

export function useOsPendentesImpressao(ativo: boolean): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!ativo) {
      setTotal(0);
      return;
    }
    let vivo = true;

    async function checar() {
      try {
        const r = await api.get<{ resumo: { criadas: number } }>('/orcamentos/ordens-producao?status=criada');
        if (vivo) setTotal(r.resumo.criadas);
      } catch {
        if (vivo) setTotal(0);
      }
    }

    void checar();
    const id = setInterval(checar, POLL_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [ativo]);

  return total;
}
