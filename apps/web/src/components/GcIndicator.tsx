// apps/web/src/components/GcIndicator.tsx
// Indicador de saúde do GestãoClick no header (DS §7).
// Online: dot pulsante verde · Offline: dot estático vermelho · Verificando: amarelo.

import type { GcStatus } from '../hooks/useGcHealth';

const CONFIG: Record<GcStatus, { cor: string; label: string; pulsante: boolean }> = {
  online: { cor: 'var(--gc-online)', label: 'online', pulsante: true },
  offline: { cor: 'var(--gc-offline)', label: 'offline', pulsante: false },
  checking: { cor: 'var(--gc-checking)', label: 'verificando', pulsante: false },
};

export function GcIndicator({ status }: { status: GcStatus }) {
  const { cor, label, pulsante } = CONFIG[status];
  return (
    <div className="flex items-center gap-2 text-xs-ui" title={`GestãoClick: ${label}`}>
      <span
        className={pulsante ? 'inline-block rounded-full gc-dot-online' : 'inline-block rounded-full'}
        style={{ width: 10, height: 10, background: cor }}
        aria-hidden="true"
      />
      <span className="text-neutral-300">
        GestãoClick: <span className="font-semibold">{label}</span>
      </span>
    </div>
  );
}
