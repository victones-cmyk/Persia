// apps/web/src/components/VersaoNovaBanner.tsx
// Faixa avisando que esta aba está rodando uma versão antiga do app.
//
// Aparece só depois de um deploy, para quem deixou a aba aberta. O botão
// recarrega; nada acontece sozinho, porque recarregar por conta própria
// descartaria um orçamento meio preenchido — bem pior que uma aba velha.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

export function VersaoNovaBanner() {
  return (
    <div className="banner banner-info" role="status" aria-live="polite">
      <FontAwesomeIcon icon={faArrowsRotate} />
      <span>
        Há uma versão mais nova do sistema. Esta aba ainda está rodando a anterior — se algo
        não estiver funcionando como o esperado, é por isso.
      </span>
      <button
        type="button"
        className="btn btn-default btn-xs"
        style={{ marginLeft: 8 }}
        onClick={() => window.location.reload()}
      >
        Atualizar agora
      </button>
    </div>
  );
}
