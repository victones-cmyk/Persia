// apps/web/src/components/ConfirmModal.tsx
// Modal de confirmação no padrão visual da aplicação (substitui o confirm() nativo).

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

export function ConfirmModal({
  aberto,
  titulo,
  mensagem,
  confirmarLabel = 'Confirmar',
  cancelarLabel = 'Cancelar',
  perigo = false,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: React.ReactNode;
  confirmarLabel?: string;
  cancelarLabel?: string;
  perigo?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!aberto) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancelar}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 420, width: '92%', boxShadow: 'var(--shadow-modal)', zIndex: 200 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 mb-4">
          {perigo && <FontAwesomeIcon icon={faTriangleExclamation} style={{ color: 'var(--color-error)', marginTop: 2 }} />}
          <div>
            <div className="text-lg-ui font-bold mb-1">{titulo}</div>
            <div className="text-sm-ui text-neutral-600">{mensagem}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-default" onClick={onCancelar}>{cancelarLabel}</button>
          <button type="button" className={perigo ? 'btn btn-danger' : 'btn btn-success'} onClick={onConfirmar} autoFocus>{confirmarLabel}</button>
        </div>
      </div>
    </div>
  );
}
