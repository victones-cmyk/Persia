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
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRulerCombined, faCheck, faTriangleExclamation, faCalculator, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { formatNum } from '../lib/formatacao';
import { useToast } from '../hooks/useToast';
import { ConfirmModal } from './ConfirmModal';

type Situacao = 'igual' | 'difere' | 'so_no_orcamento' | 'so_na_medicao';

interface ComparacaoAmbiente {
  ambiente: string;
  folhas: number;
  larguras_orcadas: number[];
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

export function ComparacaoMedicao({ orcamentoId, status, temVenda, recarregarEm }: {
  orcamentoId: string;
  status?: string;
  /** Já existe pedido/venda gerado a partir deste orçamento no GestãoClick. */
  temVenda?: boolean;
  /**
   * Muda de valor quando as OS vinculadas mudam, para este painel buscar de
   * novo. Sem isso, quem vinculava a OS com a página já aberta continuava
   * vendo o resultado de antes — que era "não há medição" — e o painel
   * simplesmente não aparecia.
   */
  recarregarEm?: number;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [linhas, setLinhas] = useState<ComparacaoAmbiente[]>([]);
  const [divergente, setDivergente] = useState(false);
  const [habilitado, setHabilitado] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

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
  }, [orcamentoId, recarregarEm]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function recalcular() {
    setConfirmando(false);
    setRecalculando(true);
    try {
      const r = await api.post<{ orcamento: { id: string }; so_na_medicao: string[]; no_lugar: boolean }>(
        `/orcamentos/${orcamentoId}/agenda/recalcular`,
      );
      if (r.so_na_medicao.length > 0) {
        showToast(
          'info',
          'Ambientes só na medição',
          `${r.so_na_medicao.join(', ')} — o técnico mediu, mas não estão no orçamento. Se entrarem, adicione você mesmo: quantas folhas o vão vira é decisão de venda.`,
        );
      }
      showToast(
        'success',
        r.no_lugar ? 'Medidas atualizadas' : 'Rascunho recalculado criado',
        'Confira folha a folha — inclusive o transpasse — antes de enviar.',
      );
      navigate(`/orcamentos/novo?editar=${r.orcamento.id}`);
    } catch (e) {
      showToast('error', 'Não deu para recalcular', e instanceof ApiError ? e.message : 'Tente novamente.');
    } finally {
      setRecalculando(false);
    }
  }

  // Sem medição vinculada não há o que comparar: o painel some em vez de ocupar
  // espaço dizendo que não tem nada.
  const temMedicao = linhas.some((l) => l.largura_medida !== null);
  if (carregando || !habilitado || !temMedicao) return null;

  const aMudar = linhas.filter((l) => l.situacao === 'difere');
  // Ambientes com folhas de larguras diferentes costumam ser duas faces sob um
  // nome só — a sacada com 4 folhas na frente e 1 na lateral. Aí o vão medido
  // não é um número só, e repartir tudo proporcionalmente mexe na face que o
  // técnico nem mediu.
  const comFacesJuntas = aMudar.filter((l) => new Set(l.larguras_orcadas).size > 1);
  const eRascunho = status === 'rascunho';
  // Cancelado não se refaz: seria ressuscitar uma decisão já tomada.
  // Vendido também não: marcar o antigo como "Substituído" muda a situação do
  // ORÇAMENTO e não desfaz a VENDA, então enviar o recalculado deixaria duas
  // vendas de pé para o mesmo cliente. Depois da venda, quem trata diferença de
  // medida é a tela de Produção, que ajusta sem duplicar.
  const podeRecalcular = aMudar.length > 0 && status !== 'cancelado' && !temVenda;

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
        <div style={{ padding: '4px 12px 12px' }}>
          <div className="helper-text">
            A largura pode divergir por transpasse, que é escolha sua — nem toda diferença é remedição.
            Confira ambiente a ambiente antes de refazer o orçamento.
          </div>
          {temVenda && aMudar.length > 0 && (
            <div className="text-xs-ui text-neutral-600 mt-2">
              <FontAwesomeIcon icon={faTriangleExclamation} className="text-neutral-400" />{' '}
              Este orçamento já virou venda, então não dá para recalculá-lo — sairia uma segunda venda no
              GestãoClick com a primeira ainda de pé. Diferença de medida em venda já fechada se resolve
              em <strong>Produção</strong>.
            </div>
          )}
          {podeRecalcular && (
            <button
              className="btn btn-default btn-sm mt-2"
              disabled={recalculando}
              onClick={() => setConfirmando(true)}
            >
              {recalculando
                ? <><FontAwesomeIcon icon={faSpinner} spin /> Recalculando…</>
                : <><FontAwesomeIcon icon={faCalculator} /> Recalcular com as medidas do técnico</>}
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        aberto={confirmando}
        titulo="Recalcular com as medidas do técnico"
        mensagem={
          <>
            <p>
              {eRascunho
                ? <>Vou <strong>atualizar este rascunho</strong> com as medidas do técnico, já repartidas entre as folhas de cada ambiente:</>
                : <>Vou criar um <strong>novo orçamento em rascunho</strong> com as medidas do técnico, já repartidas entre as folhas de cada ambiente:</>}
            </p>
            <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
              {aMudar.map((l) => (
                <li key={l.ambiente} className="text-sm-ui">
                  <strong>{l.ambiente}</strong>{' '}
                  {l.largura_orcada !== null && l.largura_medida !== null && (
                    <>{formatNum(l.largura_orcada)} → {formatNum(l.largura_medida)} m de largura</>
                  )}
                  {l.diferenca_altura !== null && Math.abs(l.diferenca_altura) >= 0.01 && l.altura_orcada !== null && l.altura_medida !== null && (
                    <>, {formatNum(l.altura_orcada)} → {formatNum(l.altura_medida)} m de altura</>
                  )}
                </li>
              ))}
            </ul>
            {comFacesJuntas.length > 0 && (
              <p className="text-sm-ui" style={{ color: 'var(--color-warning-text)' }}>
                <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
                Em <strong>{comFacesJuntas.map((l) => l.ambiente).join(', ')}</strong> as folhas têm larguras
                diferentes — costuma ser mais de uma face com o mesmo nome. Se o técnico mediu só uma delas,
                a conta vai mexer na outra também. Quando for o caso, cadastre cada face como um ambiente
                (ex.: <em>sacada frente</em> e <em>sacada lateral</em>) para o técnico medir separado.
              </p>
            )}
            <p className="text-sm-ui">
              Abre na calculadora para você conferir <strong>folha a folha</strong> — inclusive o transpasse,
              que a medida do vão não sabe reproduzir. Nada vai ao GestãoClick até você enviar.
            </p>
            {!eRascunho && (
              <p className="text-sm-ui">
                Este orçamento continua onde está e, quando o novo for enviado, passa a
                <strong> Substituído</strong> no GestãoClick.
              </p>
            )}
          </>
        }
        confirmarLabel={eRascunho ? 'Atualizar as medidas' : 'Criar rascunho recalculado'}
        cancelarLabel="Voltar"
        onConfirmar={() => void recalcular()}
        onCancelar={() => setConfirmando(false)}
      />
    </div>
  );
}
