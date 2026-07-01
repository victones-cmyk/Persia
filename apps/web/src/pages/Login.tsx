// apps/web/src/pages/Login.tsx
// Tela de login (SRD §8): card centralizado sem sidebar.
// Usuário + senha (min 6), botão "Entrar" (btn-primary) desabilitado enquanto inválido.
// O login é só um nome de usuário (não é e-mail real). Erro genérico de credenciais.

import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScissors, faSpinner, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';

export function Login() {
  const { usuario, carregando, login, sessaoExpirada, limparSessaoExpirada } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Já autenticado → vai direto para a listagem.
  if (!carregando && usuario) return <Navigate to="/orcamentos" replace />;

  // Botão habilita assim que houver ao menos 1 caractere em cada campo.
  const formValido = email.trim().length > 0 && senha.length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValido || enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await login(email, senha);
      navigate('/orcamentos', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'USUARIO_INATIVO') {
        setErro('Usuário inativo. Procure o administrador.');
      } else if (err instanceof ApiError && err.status === 401) {
        setErro('Usuário ou senha incorretos');
      } else {
        setErro('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-surface-app p-4">
      <div className="card p-6 w-full" style={{ maxWidth: 380 }}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <FontAwesomeIcon icon={faScissors} />
          <span className="font-ui font-bold text-2xl-ui">Pérsia</span>
        </div>
        <p className="text-center text-sm-ui text-neutral-500 mb-6">Rainha das Cortinas</p>

        {sessaoExpirada && (
          <div className="alert alert-info mb-4" role="status">
            <span>Sua sessão expirou. Faça login novamente.</span>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="email" className="form-label">
              Usuário
            </label>
            <input
              id="email"
              name="username"
              type="text"
              className="input"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErro(null);
                if (sessaoExpirada) limparSessaoExpirada();
              }}
              autoFocus
            />
          </div>

          <div className="mb-2">
            <label htmlFor="senha" className="form-label">
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="senha"
                name="password"
                type={mostrarSenha ? 'text' : 'password'}
                className={erro ? 'input input-error' : 'input'}
                style={{ paddingRight: 38 }}
                autoComplete="current-password"
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  setErro(null);
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setMostrarSenha((v) => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', padding: 0, lineHeight: 0,
                  color: '#6c757d', cursor: 'pointer',
                }}
              >
                <FontAwesomeIcon icon={mostrarSenha ? faEyeSlash : faEye} />
              </button>
            </div>
            {erro && <div className="helper-error">{erro}</div>}
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-4"
            disabled={!formValido || enviando}
            aria-disabled={!formValido || enviando}
          >
            {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
