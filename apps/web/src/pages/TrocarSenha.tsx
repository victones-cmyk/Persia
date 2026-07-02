// apps/web/src/pages/TrocarSenha.tsx
// Troca de senha do próprio usuário. Dois modos:
//  • Obrigatório (senha_provisoria): tela cheia; troca a senha OU "Sair e voltar ao login".
//  • Voluntário ("alterar minha senha"): acessível pela navbar, com botão Voltar.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useAuth, type Usuario } from '../hooks/useAuth';
import { api, ApiError } from '../lib/api';
import { senhaValida } from '../lib/validacao';
import { CampoSenha } from '../components/CampoSenha';

export function TrocarSenha() {
  const { usuario, atualizarUsuario, logout } = useAuth();
  const navigate = useNavigate();
  const obrigatorio = !!usuario?.senha_provisoria;

  async function sair() {
    await logout();
    navigate('/login', { replace: true });
  }

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const formValido =
    atual.length > 0 && senhaValida(nova) && nova === confirma && nova !== atual;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValido || enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.post<{ usuario: Usuario }>('/auth/alterar-senha', {
        senha_atual: atual,
        senha_nova: nova,
      });
      atualizarUsuario(r.usuario);
      navigate('/orcamentos', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SENHA_ATUAL_INVALIDA') {
        setErro('Senha atual incorreta.');
      } else if (err instanceof ApiError) {
        setErro(err.message);
      } else {
        setErro('Não foi possível trocar a senha. Tente novamente.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-surface-app p-4">
      <div className="card p-6 w-full" style={{ maxWidth: 420 }}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <FontAwesomeIcon icon={faKey} />
          <span className="font-ui font-bold text-xl-ui">
            {obrigatorio ? 'Defina sua senha' : 'Alterar senha'}
          </span>
        </div>
        <p className="text-center text-sm-ui text-neutral-500 mb-5">
          {obrigatorio
            ? 'Sua senha foi definida pelo administrador. Crie uma senha pessoal para continuar.'
            : 'Escolha uma nova senha de acesso.'}
        </p>

        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <div>
            <label htmlFor="atual" className="form-label">Senha atual</label>
            <CampoSenha id="atual" autoComplete="current-password"
              value={atual} onChange={(e) => { setAtual(e.target.value); setErro(null); }} autoFocus />
          </div>
          <div>
            <label htmlFor="nova" className="form-label">Nova senha <span className="label-optional">(mín. 8, com letra e número)</span></label>
            <CampoSenha id="nova" autoComplete="new-password"
              value={nova} onChange={(e) => { setNova(e.target.value); setErro(null); }} />
            {nova.length > 0 && !senhaValida(nova) && (
              <div className="helper-error">A senha deve ter ao menos 8 caracteres, com uma letra e um número.</div>
            )}
          </div>
          <div>
            <label htmlFor="confirma" className="form-label">Confirmar nova senha</label>
            <CampoSenha id="confirma" autoComplete="new-password"
              value={confirma} onChange={(e) => { setConfirma(e.target.value); setErro(null); }} />
            {confirma.length > 0 && nova !== confirma && (
              <div className="helper-error">As senhas não conferem.</div>
            )}
            {nova.length > 0 && nova === atual && (
              <div className="helper-error">A nova senha deve ser diferente da atual.</div>
            )}
          </div>

          {erro && <div className="alert alert-error text-sm-ui"><span>{erro}</span></div>}

          <div className="flex gap-2 pt-1">
            {!obrigatorio && (
              <button type="button" className="btn btn-default w-full" onClick={() => navigate(-1)}>
                Voltar
              </button>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={!formValido || enviando} aria-disabled={!formValido || enviando}>
              {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Salvar nova senha'}
            </button>
          </div>
        </form>

        {obrigatorio && (
          <button
            type="button"
            onClick={sair}
            className="text-sm-ui text-neutral-500"
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', marginTop: 12, textDecoration: 'underline' }}
          >
            Sair e voltar ao login
          </button>
        )}
      </div>
    </div>
  );
}
