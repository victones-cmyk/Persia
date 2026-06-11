// apps/web/src/components/ProtectedRoute.tsx
// Bloqueia rotas autenticadas (redireciona para /login) e rotas admin (redireciona p/ /orcamentos).

import { Navigate, Outlet } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';

function TelaCarregando() {
  return (
    <div className="h-full flex items-center justify-center text-neutral-500">
      <FontAwesomeIcon icon={faSpinner} spin size="lg" />
    </div>
  );
}

export function ProtectedRoute() {
  const { usuario, carregando } = useAuth();
  if (carregando) return <TelaCarregando />;
  if (!usuario) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { usuario, carregando } = useAuth();
  if (carregando) return <TelaCarregando />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.perfil !== 'admin') return <Navigate to="/orcamentos" replace />;
  return <Outlet />;
}
