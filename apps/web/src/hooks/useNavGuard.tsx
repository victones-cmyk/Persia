// apps/web/src/hooks/useNavGuard.tsx
// Guarda de navegação: quando há um orçamento em preenchimento (estado "sujo"),
// qualquer tentativa de sair da tela (menu lateral, navbar, alterar senha, sair)
// abre um modal de confirmação no padrão da aplicação para não perder os dados.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';

interface NavGuardCtx {
  /** Marca/desmarca que há dados não salvos na tela atual. */
  setDirty: (sujo: boolean) => void;
  /** Há dados não salvos agora? */
  isDirty: () => boolean;
  /** Executa `acao` direto se não houver dados não salvos; senão pede confirmação. */
  guard: (acao: () => void) => void;
}

const Ctx = createContext<NavGuardCtx | null>(null);

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  // Ref (não state) para não re-renderizar a árvore ao marcar "sujo".
  const sujoRef = useRef(false);
  const acaoPendente = useRef<(() => void) | null>(null);
  const [aberto, setAberto] = useState(false);

  const setDirty = useCallback((sujo: boolean) => {
    sujoRef.current = sujo;
  }, []);

  const isDirty = useCallback(() => sujoRef.current, []);

  const guard = useCallback((acao: () => void) => {
    if (sujoRef.current) {
      acaoPendente.current = acao;
      setAberto(true);
    } else {
      acao();
    }
  }, []);

  function confirmar() {
    setAberto(false);
    sujoRef.current = false;
    const acao = acaoPendente.current;
    acaoPendente.current = null;
    acao?.();
  }

  function cancelar() {
    setAberto(false);
    acaoPendente.current = null;
  }

  return (
    <Ctx.Provider value={{ setDirty, isDirty, guard }}>
      {children}
      <ConfirmModal
        aberto={aberto}
        titulo="Cancelar o orçamento?"
        mensagem="Você começou a preencher um orçamento e ainda não salvou. Se sair agora, as informações preenchidas serão perdidas."
        confirmarLabel="Sair sem salvar"
        cancelarLabel="Continuar preenchendo"
        perigo
        onConfirmar={confirmar}
        onCancelar={cancelar}
      />
    </Ctx.Provider>
  );
}

export function useNavGuard(): NavGuardCtx {
  const ctx = useContext(Ctx);
  // Fora do provider (ex.: telas sem Layout): vira no-op.
  if (!ctx) return { setDirty: () => {}, isDirty: () => false, guard: (a: () => void) => a() };
  return ctx;
}
