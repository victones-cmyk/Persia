// apps/web/src/components/GcOfflineBanner.tsx
// Faixa de aviso sobre o estado do GestãoClick (SRD §16, DS §11).
//
// A versão anterior dizia só "GestãoClick indisponível. Envios bloqueados." —
// e quem lia entendia que o app inteiro havia travado. Não é o caso: Salvar
// nunca passou pelo GC, e continua funcionando. Dizer o que ainda dá para fazer
// custa uma frase e evita a conclusão errada.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faFlask } from '@fortawesome/free-solid-svg-icons';

export function GcOfflineBanner() {
  return (
    <div className="banner banner-warning" role="status" aria-live="polite">
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <span>
        GestãoClick indisponível — <strong>Enviar</strong> está bloqueado.{' '}
        <strong>Salvar</strong> continua funcionando, e o orçamento fica guardado para enviar depois.
      </span>
    </div>
  );
}

/** Staging: o GC real é lido, mas nada é gravado nele (GC_SOMENTE_LEITURA). */
export function GcLeituraBanner() {
  return (
    <div className="banner banner-info" role="status" aria-live="polite">
      <FontAwesomeIcon icon={faFlask} />
      <span>
        Ambiente de teste. Cliente, tecido e preço vêm do GestãoClick de verdade, mas{' '}
        <strong>nada é gravado nele</strong> — <strong>Enviar</strong> está desligado e{' '}
        <strong>Salvar</strong> grava só aqui.
      </span>
    </div>
  );
}
