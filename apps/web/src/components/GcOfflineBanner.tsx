// apps/web/src/components/GcOfflineBanner.tsx
// Faixa de aviso quando o GestãoClick está indisponível (SRD §16, DS §11).

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

export function GcOfflineBanner() {
  return (
    <div className="banner banner-warning" role="status" aria-live="polite">
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <span>GestãoClick indisponível. Envios bloqueados.</span>
    </div>
  );
}
