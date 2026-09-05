// apps/web/src/components/ComparacaoMedicao.tsx
// Mostra o que foi orçado contra o que o técnico mediu, ambiente a ambiente.
//
// Existe porque a diferença entre a medida que o cliente passou e a que o técnico
// achou só aparecia se alguém fosse conferir na mão, abrindo a OS no outro app.
// Aqui ela aparece sozinha — e por ambiente, não só no total, porque é assim que
// o vendedor explica ao cliente: "a sacada veio 12cm mais larga".
//
// Não decide nada: largura pode divergir por transpasse (escolha do vendedor) e
// não só por remedição. Quem lê e resolve é gente.

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRulerCombined, faCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { formatNum } from '../lib/formatacao';

type Situacao = 'igual' | 'difere' | 'so_no_orcamento' | 'so_na_medicao';

interface ComparacaoAmbiente {
  ambiente: string;
  folhas: number;
  largura_orcada: number | null;
  altura_orcada: number | null;
  largura_medida: number | null;
  altura_medida: number | null;
  diferenca_largura: number | null;
  diferenca_altura: number | null;
  situacao: Situacao;
}

const medida = (l: number | null, a: number | null): string =>
  l === null && a === null ? '—' : `${l !== null ? formatNum(l) : '—'} × ${a !== null ? formatNum(a) : '—'} m`;

/** Diferença com sinal, para o vendedor ver de imediato se cresceu ou encolheu. */
function Delta({ v }: { v: number | null }) {
  if (v === null || v === 0) return <span className="text-neutral-400">—</span>;
  const cor = v > 0 ? 'var(--color-error)' : 'var(--color-warning-text)';
  return (
    <span className="font-mono tabular-nums" style={{ color: cor, fontWeight: 600 }}>
      {v > 0 ? '+' : ''}{formatNum(v)} m
    </span>
  );
}

export function ComparacaoMedicao({ orcamentoId }: { orcamentoId: string }) {
  const [linhas, setLinhas] = useState<ComparacaoAmbiente[]>([]);
  const [divergente, setDivergente] = useState(false);
  const [habilitado, setHabilitado] = useState(true);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<{ habilitado: boolean; comparacao: ComparacaoAmbiente[]; divergente: boolean }>(
        `/orcamentos/${orcamentoId}/agenda/comparacao`,
      );
      setHabilitado(r.habilitado);
      setLinhas(r.comparacao);
      setDivergente(r.divergente);
    } catch {
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [orcamentoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Sem medição vinculada não há o que comparar: o painel some em vez de ocupar
  // espaço dizendo que não tem nada.
  const temMedicao = linhas.some((l) => l.largura_medida !== null);
  if (carregando || !habilitado || !temMedicao) return null;

  return (
    <div
      className="mb-4"
      style={{
        border: '1px solid ' + (divergente ? 'var(--color-warning-border)' : 'var(--neutral-300)'),
        borderRadius: 3,
        background: divergente ? 'var(--color-warning-subtle)' : 'var(--neutral-50)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="text-sm-ui font-bold">
          <FontAwesomeIcon icon={divergente ? faTriangleExclamation : faCheck} />{' '}
          {divergente ? 'A medição do técnico difere do orçamento' : 'Medição confere com o orçamento'}
        </div>
        <span className="text-xs-ui text-neutral-600">
          <FontAwesomeIcon icon={faRulerCombined} className="text-neutral-400" /> medida do vão, por ambiente
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-sm-ui" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-2xs-ui uppercase text-neutral-500" style={{ borderBottom: '1px solid var(--neutral-300)' }}>
              <th className="text-left" style={{ padding: '6px 12px' }}>Ambiente</th>
              <th className="text-left" style={{ padding: '6px 12px' }}>No orçamento</th>
              <th className="text-left" style={{ padding: '6px 12px' }}>Medido</th>
              <th className="text-left" style={{ padding: '6px 12px' }}>Largura</th>
              <th className="text-left" style={{ padding: '6px 12px' }}>Altura</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={`${l.ambiente}-${i}`} style={{ borderBottom: '1px solid var(--neutral-200)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div className="font-semibold text-neutral-800">{l.ambiente}</div>
                  {l.situacao === 'so_no_orcamento' && (
                    <div className="text-xs-ui text-neutral-500">o técnico não mediu este</div>
                  )}
                  {l.situacao === 'so_na_medicao' && (
                    <div className="text-xs-ui text-neutral-500">medido, mas não está no orçamento</div>
                  )}
                </td>
                <td className="font-mono tabular-nums text-neutral-700" style={{ padding: '8px 12px' }}>
                  {l.folhas > 0 ? (
                    <>
                      {medida(l.largura_orcada, l.altura_orcada)}
                      <div className="text-xs-ui text-neutral-500" style={{ fontFamily: 'inherit' }}>
                        {l.folhas} {l.folhas === 1 ? 'peça' : 'peças'}
                        {l.folhas > 1 ? ' somadas' : ''}
                      </div>
                    </>
                  ) : '—'}
                </td>
                <td className="font-mono tabular-nums text-neutral-700" style={{ padding: '8px 12px' }}>
                  {medida(l.largura_medida, l.altura_medida)}
                </td>
                <td style={{ padding: '8px 12px' }}><Delta v={l.diferenca_largura} /></td>
                <td style={{ padding: '8px 12px' }}><Delta v={l.diferenca_altura} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {divergente && (
        <div className="helper-text" style={{ padding: '4px 12px 12px' }}>
          A largura pode divergir por transpasse, que é escolha sua — nem toda diferença é remedição.
          Confira ambiente a ambiente antes de refazer o orçamento.
        </div>
      )}
    </div>
  );
}
