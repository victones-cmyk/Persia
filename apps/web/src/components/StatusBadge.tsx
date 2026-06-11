// apps/web/src/components/StatusBadge.tsx
// 3 estados operacionais + cancelado (DS §12). Classes literais (sem template string).

import type { StatusOrcamento } from '../lib/orcamentoTypes';
import { STATUS_LABEL } from '../lib/orcamentoTypes';

const ESTILO: Record<StatusOrcamento, { bg: string; fg: string; bd: string }> = {
  enviado: { bg: '#d4edda', fg: '#155724', bd: '#c3e6cb' },
  rascunho: { bg: '#e9ecef', fg: '#495057', bd: '#dee2e6' },
  erro: { bg: '#f8d7da', fg: '#721c24', bd: '#f5c6cb' },
  cancelado: { bg: '#e9ecef', fg: '#6c757d', bd: '#dee2e6' },
};

export function StatusBadge({ status }: { status: StatusOrcamento }) {
  const e = ESTILO[status];
  return (
    <span className="badge" style={{ background: e.bg, color: e.fg, borderColor: e.bd }}>
      {STATUS_LABEL[status]}
    </span>
  );
}
