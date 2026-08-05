import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxOpen, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';

interface Material {
  produto_id: string;
  nome: string;
  quantidade: number;
  unidade: string;
}

interface OrdemIncluida {
  id: string;
  codigo: string;
  produto: string;
  ambiente: string;
}

interface OrdemExcluida {
  id: string;
  codigo: string;
  motivo: string;
}

interface PreviaSaidaEstoque {
  pedido: string;
  cliente: string;
  materiais: Material[];
  ordens_incluidas: OrdemIncluida[];
  ordens_excluidas: OrdemExcluida[];
  observacao: string;
}

function numero(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function EstoqueSaidaModal({
  aberto,
  orcamentoId,
  onFechar,
  onConfirmado,
}: {
  aberto: boolean;
  orcamentoId: string | null;
  onFechar: () => void;
  onConfirmado: () => void;
}) {
  const [previa, setPrevia] = useState<PreviaSaidaEstoque | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || !orcamentoId) {
      setPrevia(null);
      setErro(null);
      setCarregando(false);
      return;
    }
    setPrevia(null);
    setCarregando(true);
    setErro(null);
    api.get<PreviaSaidaEstoque>(`/orcamentos/${orcamentoId}/estoque-saida/preview`)
      .then((r) => setPrevia({
        ...r,
        materiais: r.materiais ?? [],
        ordens_excluidas: r.ordens_excluidas ?? [],
        observacao: r.observacao ?? '',
      }))
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao montar a lista de materiais.'))
      .finally(() => setCarregando(false));
  }, [aberto, orcamentoId]);

  if (!aberto || !orcamentoId) return null;

  // eslint-disable-next-line no-console
  console.log('[EstoqueSaidaModal] DEBUG renderizando', { aberto, orcamentoId, carregando, previa, erro });

  // No primeiro render após abrir, o efeito acima ainda não rodou — "carregando"
  // (estado) ainda está no valor de antes. Sem isso, essa primeira renderização
  // mostra a área de conteúdo vazia (nem spinner nem dados) até o próximo commit.
  const mostrandoCarregamento = carregando || (!previa && !erro);

  async function confirmar() {
    if (!orcamentoId) return;
    setConfirmando(true);
    setErro(null);
    try {
      await api.post(`/orcamentos/${orcamentoId}/estoque-saida`);
      onConfirmado();
      onFechar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao dar saída no estoque.');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' }}
      onClick={onFechar}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 640, width: 'calc(100vw - 32px)', maxHeight: '85vh', overflow: 'auto', boxShadow: 'var(--shadow-modal)', zIndex: 210, boxSizing: 'border-box' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="text-lg-ui font-bold">
            <FontAwesomeIcon icon={faBoxOpen} /> Dar saída no estoque
          </div>
          <button type="button" className="btn btn-default btn-xs" onClick={onFechar}>Fechar</button>
        </div>

        {erro && <div className="alert alert-danger mb-3">{erro}</div>}

        {mostrandoCarregamento ? (
          <div style={{ padding: 16 }}><FontAwesomeIcon icon={faSpinner} spin /> Calculando materiais...</div>
        ) : previa ? (
          <>
            {previa.materiais.length === 0 ? (
              <div className="alert alert-warning mb-3">Nenhum material com produto mapeado no GestãoClick para dar saída.</div>
            ) : (
              <div className="table-scroll mb-3" style={{ border: '1px solid #dee2e6', borderRadius: 3 }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 8, textAlign: 'left' }}>Material</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.materiais.map((m) => (
                      <tr key={m.produto_id} style={{ borderTop: '1px solid #dee2e6' }}>
                        <td style={{ padding: 8 }}>{m.nome}</td>
                        <td style={{ padding: 8, textAlign: 'right' }} className="font-mono text-sm-ui">{numero(m.quantidade)} {m.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-sm-ui font-bold mb-1">Registro de destino (fica no log interno)</div>
            <pre style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 3, padding: 10, whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 12 }}>
              {previa.observacao}
            </pre>

            {previa.ordens_excluidas.length > 0 && (
              <div className="alert alert-warning mb-3">
                <div className="font-bold mb-1"><FontAwesomeIcon icon={faTriangleExclamation} /> {previa.ordens_excluidas.length} OS não incluída(s) nesta baixa</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {previa.ordens_excluidas.map((o) => (
                    <li key={o.id} className="text-sm-ui">{o.codigo}: {o.motivo}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn btn-default" onClick={onFechar}>Cancelar</button>
              <button
                type="button"
                className="btn btn-success"
                disabled={confirmando || previa.materiais.length === 0}
                onClick={() => void confirmar()}
              >
                {confirmando ? <><FontAwesomeIcon icon={faSpinner} spin /> Confirmando...</> : `Confirmar baixa (${previa.materiais.length} produto${previa.materiais.length === 1 ? '' : 's'})`}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
