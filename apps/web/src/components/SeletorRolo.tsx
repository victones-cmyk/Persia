// apps/web/src/components/SeletorRolo.tsx
// O mesmo tecido vem em rolos de larguras diferentes, e a escolha muda o preço.
//
// Quem vende não tem como saber de cabeça que a peça de 1,50 m sai R$ 69,44 mais
// barata no rolo de 1,80 do que no de 2,25 — isso depende da medida da peça, e
// muda a cada item. Antes disso a Pérsia simplesmente cobrava o rolo que o
// vendedor tivesse escolhido na busca, que costuma ser o primeiro que aparece.
//
// Recomenda, não escolhe. Pode haver motivo que o app não conhece: o rolo
// estreito acabando, uma sobra que se quer gastar. Por isso a troca é um clique
// do vendedor, nunca automática — e o rolo onde a peça NÃO cabe continua na
// lista, marcado, em vez de sumir sem explicação.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScissors, faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { formatBRL, formatNum } from '../lib/formatacao';
import type { RoloDoTecido } from '../lib/calcTypes';

function diferencaTexto(r: RoloDoTecido): string {
  if (r.selecionado) return 'escolhido';
  if (!r.cabe) return '—';
  if (r.diferenca === 0) return 'mesmo preço';
  return `${r.diferenca > 0 ? '+' : '−'}${formatBRL(Math.abs(r.diferenca))}`;
}

function encaixeTexto(r: RoloDoTecido): string {
  return r.cabe ? `sobra ${formatNum(r.folga_m * 100, 0)} cm` : 'não cabe';
}

export function SeletorRolo({
  rolos,
  onEscolher,
}: {
  rolos: RoloDoTecido[] | undefined;
  onEscolher: (tecidoId: string) => void;
}) {
  if (!rolos || rolos.length < 2) return null;

  const economia = rolos.find((r) => r.recomendado && !r.selecionado && r.diferenca < 0);

  return (
    <div
      className="mt-2 text-xs-ui"
      style={{
        border: `1px solid var(${economia ? '--color-success-border' : '--neutral-300'})`,
        background: `var(${economia ? '--color-success-subtle' : '--neutral-50'})`,
        borderRadius: 3,
        padding: '6px 8px',
      }}
    >
      <div className="flex items-center gap-1 mb-1 font-semibold">
        <FontAwesomeIcon icon={faScissors} className="text-neutral-500" />
        {economia
          ? <span>O rolo de {formatNum(economia.dimensao_m)} m economiza {formatBRL(Math.abs(economia.diferenca))} nesta peça</span>
          : <span className="text-neutral-600">Este tecido tem mais de uma largura de rolo</span>}
      </div>

      <div className="flex flex-col gap-0.5">
        {rolos.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={r.selecionado || !r.cabe}
            onClick={() => onEscolher(r.id)}
            title={r.cabe ? `Usar o rolo de ${formatNum(r.dimensao_m)} m` : 'A peça é mais larga que este rolo'}
            className="flex items-center gap-2 text-left w-full"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '2px 0',
              cursor: r.selecionado || !r.cabe ? 'default' : 'pointer',
              opacity: r.cabe ? 1 : 0.55,
            }}
          >
            <span style={{ width: 14 }}>
              {r.recomendado && <FontAwesomeIcon icon={faCircleCheck} style={{ color: 'var(--color-success)' }} />}
            </span>
            <span className="font-mono tabular-nums" style={{ width: 52 }}>{formatNum(r.dimensao_m)} m</span>
            <span className="font-mono tabular-nums font-semibold" style={{ width: 84 }}>{formatBRL(r.valor)}</span>
            <span className="text-neutral-500" style={{ width: 82 }}>{encaixeTexto(r)}</span>
            <span
              className="font-mono tabular-nums"
              style={{ color: !r.selecionado && r.cabe && r.diferenca < 0 ? 'var(--color-success)' : 'var(--neutral-500)' }}
            >
              {diferencaTexto(r)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
