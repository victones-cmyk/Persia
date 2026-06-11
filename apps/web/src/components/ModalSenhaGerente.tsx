// apps/web/src/components/ModalSenhaGerente.tsx
// Modal de aprovação de desconto acima do limite (RN-08, DS §14).
// onConfirmar(senha) → true: aprovado (fecha) · false: senha incorreta (.input-shake).

import { useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

export function ModalSenhaGerente({
  aberto,
  descontoPct,
  onCancelar,
  onConfirmar,
}: {
  aberto: boolean;
  descontoPct: number;
  onCancelar: () => void;
  onConfirmar: (senha: string) => Promise<boolean>;
}) {
  const [senha, setSenha] = useState('');
  const [shake, setShake] = useState(false);
  const [erro, setErro] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (!aberto) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!senha || enviando) return;
    setEnviando(true);
    setErro(false);
    const ok = await onConfirmar(senha);
    setEnviando(false);
    if (!ok) {
      setErro(true);
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } else {
      setSenha('');
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancelar}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 400, width: '90%', boxShadow: 'var(--shadow-modal)', zIndex: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <div className="text-lg-ui font-bold">Aprovação de desconto</div>
          <div className="text-sm-ui text-neutral-500">
            O desconto de {descontoPct}% está acima do seu limite. Informe a senha de um gerente (admin) para aprovar.
          </div>
        </div>
        <form onSubmit={submit}>
          <input
            type="password"
            autoFocus
            className={(erro ? 'input input-error' : 'input') + (shake ? ' input-shake' : '')}
            placeholder="Senha do gerente"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setErro(false);
            }}
          />
          {erro && <div className="helper-error">Senha incorreta. Tente novamente.</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" className="btn btn-default" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-success" disabled={!senha || enviando}>
              {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
