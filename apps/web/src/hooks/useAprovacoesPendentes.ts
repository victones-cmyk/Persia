// apps/web/src/hooks/useAprovacoesPendentes.ts
// Polling das solicitações de absorção de diferença de medição aguardando
// decisão do admin — sem isso, a única forma de descobrir uma solicitação era
// reabrir manualmente o orçamento exato onde ela foi feita.

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { OrcamentoListItem } from '../lib/orcamentoTypes';

export interface AprovacaoPendente extends OrcamentoListItem {
  medicao_absorcao_diferenca: number;
  medicao_absorcao_solicitado_em: string;
}

const POLL_MS = 60_000;

export function useAprovacoesPendentes(ativo: boolean) {
  const [itens, setItens] = useState<AprovacaoPendente[]>([]);

  useEffect(() => {
    if (!ativo) {
      setItens([]);
      return;
    }
    let vivo = true;

    async function checar() {
      try {
        const r = await api.get<{ total: number; orcamentos: AprovacaoPendente[] }>('/orcamentos/producao/aprovacoes-pendentes');
        if (vivo) setItens(r.orcamentos);
      } catch {
        if (vivo) setItens([]);
      }
    }

    void checar();
    const id = setInterval(checar, POLL_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [ativo]);

  return itens;
}
