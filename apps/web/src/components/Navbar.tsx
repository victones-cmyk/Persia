// apps/web/src/components/Navbar.tsx
// Header preto de 50px (DS §7): marca à esquerda, indicador GC + usuário à direita.

import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScissors, faRightFromBracket, faKey } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { useGcHealth } from '../hooks/useGcHealth';
import { GcIndicator } from './GcIndicator';

export function Navbar({ gcStatus }: { gcStatus: ReturnType<typeof useGcHealth>['status'] }) {
  const { usuario, logout } = useAuth();

  return (
    <header className="h-header bg-surface-header text-neutral-0 flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faScissors} />
        <span className="font-ui font-bold text-lg-ui">Pérsia</span>
        <span className="text-xs-ui text-neutral-400 hidden sm:inline">Rainha das Cortinas</span>
      </div>

      <div className="flex items-center gap-5">
        <GcIndicator status={gcStatus} />
        {usuario && (
          <div className="flex items-center gap-3 text-xs-ui">
            <span className="text-neutral-300 hidden sm:inline">
              {usuario.nome}
              <span className="badge badge-secondary ml-2">
                {usuario.perfil === 'admin' ? 'Administrador' : 'Vendedor'}
              </span>
            </span>
            <Link
              to="/trocar-senha"
              className="text-neutral-300 hover:text-neutral-0 flex items-center gap-2"
              title="Alterar senha"
            >
              <FontAwesomeIcon icon={faKey} />
              <span className="hidden sm:inline">Alterar senha</span>
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-neutral-300 hover:text-neutral-0 flex items-center gap-2"
              title="Sair"
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
