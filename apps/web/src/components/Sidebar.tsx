// apps/web/src/components/Sidebar.tsx
// Navegação lateral persistente de 220px (DS §7). Seção admin só para perfil admin.

import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileLines,
  faPlus,
  faUsers,
  faGear,
  faClockRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useAuth } from '../hooks/useAuth';

interface Item {
  to: string;
  label: string;
  icon: IconDefinition;
  end?: boolean;
}

const ITENS_GERAIS: Item[] = [
  { to: '/orcamentos', label: 'Orçamentos', icon: faFileLines, end: true },
  { to: '/orcamentos/novo', label: 'Novo Orçamento', icon: faPlus },
];

const ITENS_ADMIN: Item[] = [
  { to: '/admin/usuarios', label: 'Usuários', icon: faUsers },
  { to: '/admin/configuracoes', label: 'Configurações', icon: faGear },
  { to: '/admin/log-acoes', label: 'Log de Ações', icon: faClockRotateLeft },
];

function Link({ item }: { item: Item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
    >
      <FontAwesomeIcon icon={item.icon} fixedWidth />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin';

  return (
    <nav
      className="w-sidebar bg-surface-sidebar shadow-sidebar shrink-0 overflow-y-auto py-3"
      aria-label="Navegação principal"
    >
      <div className="flex flex-col">
        {ITENS_GERAIS.map((item) => (
          <Link key={item.to} item={item} />
        ))}
      </div>

      {isAdmin && (
        <div className="mt-4">
          <div className="px-4 py-2 text-2xs-ui font-bold uppercase text-neutral-500 tracking-wide">
            Administração
          </div>
          <div className="flex flex-col">
            {ITENS_ADMIN.map((item) => (
              <Link key={item.to} item={item} />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
