// apps/web/src/components/Sidebar.tsx
// Navegação: sidebar lateral persistente de 220px no desktop (DS §7); no mobile
// (< lg) vira uma barra de abas fixa no rodapé (padrão nativo — polegar alcança
// o rodapé, não o topo). Itens extras de admin/revenda ficam atrás de uma aba
// "Mais". Seção admin só para perfil admin; seção revenda só para perfil revenda.

import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileLines,
  faPlus,
  faFileInvoiceDollar,
  faIndustry,
  faBoxOpen,
  faUsers,
  faClockRotateLeft,
  faSliders,
  faCalculator,
  faDatabase,
  faPercent,
  faEllipsis,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useAuth } from '../hooks/useAuth';
import { useNavGuard } from '../hooks/useNavGuard';
import { useAprovacoesPendentes } from '../hooks/useAprovacoesPendentes';
import { useOsPendentesImpressao } from '../hooks/useOsPendentesImpressao';
import { ConfirmModal } from './ConfirmModal';

interface Item {
  to: string;
  label: string;
  icon: IconDefinition;
  end?: boolean;
  badge?: number;
  badgeTitulo?: string;
}

const ITENS_GERAIS: Item[] = [
  { to: '/orcamentos', label: 'Orçamentos', icon: faFileLines, end: true },
  { to: '/orcamentos/novo', label: 'Novo Orçamento', icon: faPlus },
  { to: '/vendas', label: 'Vendas', icon: faFileInvoiceDollar, end: true },
  { to: '/producao', label: 'Produção', icon: faIndustry, end: true },
  { to: '/baixa-estoque', label: 'Baixa de Estoque', icon: faBoxOpen, end: true },
];

const ITENS_ADMIN: Item[] = [
  { to: '/admin/usuarios', label: 'Usuários', icon: faUsers },
  { to: '/admin/regras-calculo', label: 'Regras de Cálculo', icon: faSliders },
  { to: '/admin/calculadoras', label: 'Calculadoras', icon: faCalculator },
  { to: '/admin/materias-primas', label: 'Matérias-primas', icon: faDatabase },
  { to: '/admin/log-acoes', label: 'Log de Ações', icon: faClockRotateLeft },
];

const ITENS_REVENDA: Item[] = [
  { to: '/markup', label: 'Markup', icon: faPercent },
];

/** Navega respeitando a guarda de "não salvo" (compartilhado pelas duas variantes). */
function useIrPara(onAvisoNaoSalvo: () => void) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { guard, isDirty } = useNavGuard();
  return (to: string) => {
    if (to === pathname) {
      if (to === '/orcamentos/novo' && isDirty()) onAvisoNaoSalvo();
      return;
    }
    guard(() => navigate(to));
  };
}

/** Item da sidebar de desktop (lista vertical, ícone + label). */
function LinkLateral({ item, onAvisoNaoSalvo }: { item: Item; onAvisoNaoSalvo: () => void }) {
  const ir = useIrPara(onAvisoNaoSalvo);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
      onClick={(e) => { e.preventDefault(); ir(item.to); }}
    >
      <FontAwesomeIcon icon={item.icon} fixedWidth />
      <span>{item.label}</span>
      {Boolean(item.badge) && <BadgeContador n={item.badge!} titulo={item.badgeTitulo ?? `${item.badge} pendente(s)`} />}
    </NavLink>
  );
}

/** Aba da barra fixa do rodapé (mobile): ícone em cima, label embaixo, alvo de toque ≥44px. */
function AbaMobile({ item, onAvisoNaoSalvo }: { item: Item; onAvisoNaoSalvo: () => void }) {
  const ir = useIrPara(onAvisoNaoSalvo);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'sidebar-aba active' : 'sidebar-aba')}
      onClick={(e) => { e.preventDefault(); ir(item.to); }}
    >
      <span className="relative">
        <FontAwesomeIcon icon={item.icon} />
        {Boolean(item.badge) && (
          <span
            style={{
              position: 'absolute', top: -4, right: -8, borderRadius: 999, minWidth: 14, height: 14,
              padding: '0 3px', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', background: 'var(--color-error)', color: '#fff',
            }}
          >
            {item.badge}
          </span>
        )}
      </span>
      <span className="text-2xs-ui">{item.label}</span>
    </NavLink>
  );
}

function BadgeContador({ n, titulo }: { n: number; titulo: string }) {
  return (
    <span
      style={{
        marginLeft: 'auto', borderRadius: 999, minWidth: 18, height: 18, padding: '0 5px', fontSize: 11,
        fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-error)', color: '#fff',
      }}
      title={titulo}
    >
      {n}
    </span>
  );
}

/** Folha deslizante do rodapé com os itens extras (admin/revenda) — evita lotar a barra de abas. */
function FolhaMais({
  titulo, itens, aberta, onFechar, onAvisoNaoSalvo,
}: {
  titulo: string;
  itens: Item[];
  aberta: boolean;
  onFechar: () => void;
  onAvisoNaoSalvo: () => void;
}) {
  const ir = useIrPara(onAvisoNaoSalvo);
  if (!aberta) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }}
      onClick={onFechar}
      role="presentation"
    >
      <div
        className="bg-surface-card border-t border-neutral-300"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4,
          boxShadow: 'var(--shadow-modal)', paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <span className="text-sm-ui font-bold text-neutral-700 uppercase tracking-wide">{titulo}</span>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-neutral-500" style={{ background: 'none', border: 'none', padding: 8 }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        {itens.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="sidebar-link"
            style={{ padding: '14px 16px' }}
            onClick={(e) => { e.preventDefault(); onFechar(); ir(item.to); }}
          >
            <FontAwesomeIcon icon={item.icon} fixedWidth />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = usuario?.perfil === 'admin';
  const isRevenda = usuario?.perfil === 'revenda';
  const [avisoAberto, setAvisoAberto] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);
  const aprovacoesPendentes = useAprovacoesPendentes(isAdmin);
  const osPendentesImpressao = useOsPendentesImpressao(Boolean(usuario));

  const itensGerais = ITENS_GERAIS.map((item) => {
    if (item.to === '/vendas' && aprovacoesPendentes.length > 0) {
      return { ...item, badge: aprovacoesPendentes.length, badgeTitulo: `${aprovacoesPendentes.length} aprovação(ões) de diferença de medição pendente(s)` };
    }
    if (item.to === '/producao' && osPendentesImpressao > 0) {
      return { ...item, badge: osPendentesImpressao, badgeTitulo: `${osPendentesImpressao} ordem(ns) de produção pendente(s) de impressão` };
    }
    return item;
  });

  const itensExtras = isAdmin ? ITENS_ADMIN : isRevenda ? ITENS_REVENDA : [];
  // Novo Orçamento tem sua própria barra fixa de total/ações no rodapé — a barra de
  // navegação some ali pra não empilhar duas barras fixas e roubar espaço da tela.
  const esconderAbaMobile = pathname === '/orcamentos/novo';

  return (
    <>
      {/* Desktop: sidebar lateral persistente. */}
      <nav
        className="hidden lg:flex lg:flex-col w-sidebar bg-surface-sidebar shadow-sidebar shrink-0 lg:overflow-y-auto py-3"
        aria-label="Navegação principal"
      >
        <div className="flex flex-col">
          {itensGerais.map((item) => (
            <LinkLateral key={item.to} item={item} onAvisoNaoSalvo={() => setAvisoAberto(true)} />
          ))}
        </div>

        {isAdmin && (
          <div className="mt-4">
            <div className="px-4 py-2 text-2xs-ui font-bold uppercase text-neutral-500 tracking-wide">Administração</div>
            <div className="flex flex-col">
              {ITENS_ADMIN.map((item) => (
                <LinkLateral key={item.to} item={item} onAvisoNaoSalvo={() => setAvisoAberto(true)} />
              ))}
            </div>
          </div>
        )}

        {isRevenda && (
          <div className="flex flex-col">
            {ITENS_REVENDA.map((item) => (
              <LinkLateral key={item.to} item={item} onAvisoNaoSalvo={() => setAvisoAberto(true)} />
            ))}
          </div>
        )}
      </nav>

      {/* Mobile/tablet: barra de abas fixa no rodapé — alcance de polegar, sem scroll horizontal. */}
      {!esconderAbaMobile && (
        <nav
          className="lg:hidden fixed left-0 right-0 bottom-0 z-40 bg-surface-sidebar border-t border-neutral-300 flex"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Navegação principal"
        >
          {itensGerais.map((item) => (
            <AbaMobile key={item.to} item={item} onAvisoNaoSalvo={() => setAvisoAberto(true)} />
          ))}
          {itensExtras.length > 0 && (
            <button
              type="button"
              className={maisAberto ? 'sidebar-aba active' : 'sidebar-aba'}
              onClick={() => setMaisAberto(true)}
            >
              <FontAwesomeIcon icon={faEllipsis} />
              <span className="text-2xs-ui">Mais</span>
            </button>
          )}
        </nav>
      )}

      <FolhaMais
        titulo={isAdmin ? 'Administração' : 'Revenda'}
        itens={itensExtras}
        aberta={maisAberto}
        onFechar={() => setMaisAberto(false)}
        onAvisoNaoSalvo={() => { setMaisAberto(false); setAvisoAberto(true); }}
      />

      <ConfirmModal
        aberto={avisoAberto}
        titulo="Orçamento não salvo"
        mensagem="O orçamento atual ainda não foi salvo. Continue de onde parou e use Salvar ou Enviar quando terminar."
        confirmarLabel="Continuar"
        ocultarCancelar
        onConfirmar={() => setAvisoAberto(false)}
        onCancelar={() => setAvisoAberto(false)}
      />
    </>
  );
}
