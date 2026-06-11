// apps/web/src/pages/Placeholder.tsx
// Página temporária para rotas ainda não implementadas (Fases 3–7).

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPersonDigging } from '@fortawesome/free-solid-svg-icons';

export function Placeholder({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <div>
      <h1 className="text-2xl-ui mb-4">{titulo}</h1>
      <div className="card p-6 max-w-form">
        <div className="alert alert-info">
          <FontAwesomeIcon icon={faPersonDigging} />
          <div>
            <div className="font-semibold">Em desenvolvimento</div>
            <div className="text-xs-ui opacity-85">
              Esta tela será implementada na {fase}. A infraestrutura, autenticação e layout já estão prontos.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
