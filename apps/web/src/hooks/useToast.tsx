// apps/web/src/hooks/useToast.tsx
// Sistema de toasts (DS §11): canto inferior direito, borda lateral por tipo.

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastTipo = 'success' | 'error' | 'warning' | 'info';
interface Toast {
  id: number;
  tipo: ToastTipo;
  titulo: string;
  sub?: string;
}

interface ToastCtx {
  showToast: (tipo: ToastTipo, titulo: string, sub?: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const BORDA: Record<ToastTipo, string> = {
  success: 'var(--action-add)',
  error: 'var(--action-delete)',
  warning: 'var(--action-edit)',
  info: 'var(--action-view)',
};

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((tipo: ToastTipo, titulo: string, sub?: string) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, tipo, titulo, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <Ctx.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            style={{
              maxWidth: 360,
              padding: '12px 14px',
              background: '#212529',
              color: '#fff',
              borderRadius: 3,
              borderLeft: `3px solid ${BORDA[t.tipo]}`,
              boxShadow: 'var(--shadow-toast)',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 500 }}>{t.titulo}</div>
            {t.sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{t.sub}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return c;
}
