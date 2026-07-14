// apps/web/src/components/Sidebar.tsx
// Navegação lateral persistente de 220px (DS §7). Seção admin só para perfil admin.

import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileLines,
  faPlus,
  faFileInvoiceDollar,
  faIndustry,
  faUsers,
  faClockRotateLeft,
  faSliders,
  faCalculator,
  faDatabase,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useAuth } from '../hooks/useAuth';
import { useNavGuard } from '../hooks/useNavGuard';
import { ConfirmModal } from './ConfirmModal';

interface Item {
  to: string;
  label: string;
  icon: IconDefinition;
  end?: boolean;
}

const ITENS_GERAIS: Item[] = [
  { to: '/orcamentos', label: 'Orçamentos', icon: faFileLines, end: true },
  { to: '/orcamentos/novo', label: 'Novo Orçamento', icon: faPlus },
  { to: '/vendas', label: 'Vendas', icon: faFileInvoiceDollar, end: true },
  { to: '/producao', label: 'Produção', icon: faIndustry, end: true },
];

const ITENS_ADMIN: Item[] = [
  { to: '/admin/usuarios', label: 'Usuários', icon: faUsers },
  { to: '/admin/regras-calculo', label: 'Regras de Cálculo', icon: faSliders },
  { to: '/admin/calculadoras', label: 'Calculadoras', icon: faCalculator },
  { to: '/admin/materias-primas', label: 'Matérias-primas', icon: faDatabase },
  { to: '/admin/log-acoes', label: 'Log de Ações', icon: faClockRotateLeft },
];


function Link({ item, onAvisoNaoSalvo }: { item: Item; onAvisoNaoSalvo: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { guard, isDirty } = useNavGuard();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
      onClick={(e) => {
        e.preventDefault();
        // Já está na tela de Novo Orçamento com dados não salvos: avisa (não recria nem sai).
        if (item.to === pathname) {
          if (item.to === '/orcamentos/novo' && isDirty()) onAvisoNaoSalvo();
          return;
        }
        // Demais itens: passa pela guarda (pede confirmação se houver dados não salvos).
        guard(() => navigate(item.to));
      }}
    >
      <FontAwesomeIcon icon={item.icon} fixedWidth />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin';
  const [avisoAberto, setAvisoAberto] = useState(false);

  return (
    <nav
      className="w-sidebar bg-surface-sidebar shadow-sidebar shrink-0 overflow-y-auto py-3"
      aria-label="Navegação principal"
    >
      <div className="flex flex-col">
        {ITENS_GERAIS.map((item) => (
          <Link key={item.to} item={item} onAvisoNaoSalvo={() => setAvisoAberto(true)} />
        ))}
      </div>

      {isAdmin && (
        <div className="mt-4">
          <div className="px-4 py-2 text-2xs-ui font-bold uppercase text-neutral-500 tracking-wide">
            Administração
          </div>
          <div className="flex flex-col">
            {ITENS_ADMIN.map((item) => (
              <Link key={item.to} item={item} onAvisoNaoSalvo={() => setAvisoAberto(true)} />
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        aberto={avisoAberto}
        titulo="Orçamento não salvo"
        mensagem="O orçamento atual ainda não foi salvo. Continue de onde parou e use Salvar ou Enviar quando terminar."
        confirmarLabel="Continuar"
        ocultarCancelar
        onConfirmar={() => setAvisoAberto(false)}
        onCancelar={() => setAvisoAberto(false)}
      />
    </nav>
  );
}
