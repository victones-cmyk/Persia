// apps/web/src/hooks/useAuth.tsx
// Contexto de autenticação: restaura sessão (/auth/me), login, logout
// e tratamento de sessão expirada em rotas protegidas.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setUnauthorizedHandler } from '../lib/api';
import { limparRascunhoLocal } from '../lib/rascunhoLocal';
import { limparFiltrosOrcamento } from '../lib/filtrosSessao';

export type Perfil = 'vendedor' | 'admin' | 'revenda';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  loja_id: string | null;
  gc_usuario_id: string | null;
  senha_provisoria: boolean;
  // Só relevantes para perfil revenda.
  gc_cliente_vinculado_id: string | null;
  gc_cliente_vinculado_nome: string | null;
  desconto_percentual: number | null;
  calculadoras_permitidas: string[];
}

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  sessaoExpirada: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  limparSessaoExpirada: () => void;
  atualizarUsuario: (u: Usuario) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  // Handler global de 401 inesperado (sessão caiu durante uso).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUsuario(null);
      setSessaoExpirada(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Restaura sessão no carregamento inicial.
  useEffect(() => {
    api
      .get<{ usuario: Usuario }>('/auth/me')
      .then((r) => setUsuario(r.usuario))
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, []);

  async function login(email: string, senha: string): Promise<void> {
    const r = await api.post<{ usuario: Usuario }>('/auth/login', { email, senha });
    // Cada login começa limpo: filtros da lista não vazam entre sessões/usuários.
    limparFiltrosOrcamento();
    setUsuario(r.usuario);
    setSessaoExpirada(false);
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
    // Não deixar dados de cliente (rascunho em preenchimento) na estação após sair.
    limparRascunhoLocal();
    limparFiltrosOrcamento();
    setUsuario(null);
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        carregando,
        sessaoExpirada,
        login,
        logout,
        limparSessaoExpirada: () => setSessaoExpirada(false),
        atualizarUsuario: setUsuario,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
