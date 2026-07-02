// apps/web/src/components/CampoSenha.tsx
// Campo de senha com botão "olhinho" para exibir/ocultar o texto digitado.
// Reutilizável em login, troca de senha e cadastro/edição de usuário.
// Aceita as mesmas props de um <input> (id, name, value, onChange, required, etc.),
// exceto `type` (controlado internamente). className default = "input".

import { useState, type InputHTMLAttributes } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function CampoSenha({ className = 'input', style, ...rest }: Props) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        type={mostrar ? 'text' : 'password'}
        className={className}
        style={{ paddingRight: 38, ...style }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        title={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        onClick={() => setMostrar((v) => !v)}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', padding: 0, lineHeight: 0,
          color: '#6c757d', cursor: 'pointer',
        }}
      >
        <FontAwesomeIcon icon={mostrar ? faEyeSlash : faEye} />
      </button>
    </div>
  );
}
