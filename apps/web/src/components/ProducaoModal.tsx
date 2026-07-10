import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilePdf, faTag } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import type { ItemSnapshot, OrcamentoListItem } from '../lib/orcamentoTypes';

interface OrdemProducao {
  id: string;
  codigo: string;
  item_index: number;
  gc_pedido_codigo: string;
  status: 'criada' | 'impressa' | 'cancelada';
}

interface ItemProducao {
  index: number;
  item: ItemSnapshot;
  ordem: OrdemProducao | null;
}

interface ProducaoPayload {
  orcamento: OrcamentoListItem;
  itens: ItemProducao[];
}

function medida(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function produtoLabel(item: ItemSnapshot): string {
  return item.nome_produto || item.tipo || 'Produto';
}

export function ProducaoModal({
  aberto,
  orcamento,
  onFechar,
  onAtualizar,
}: {
  aberto: boolean;
  orcamento: OrcamentoListItem | null;
  onFechar: () => void;
  onAtualizar: () => void;
}) {
  const [dados, setDados] = useState<ProducaoPayload | null>(null);
  const [pedido, setPedido] = useState('');
  const [entrega, setEntrega] = useState('');
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [imprimindoId, setImprimindoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function carregar() {
    if (!orcamento) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await api.get<ProducaoPayload>(`/orcamentos/${orcamento.id}/producao`);
      setDados(r);
      setPedido(r.orcamento.gc_pedido_codigo ?? '');
      setEntrega(r.orcamento.pedido_entrega_em ? r.orcamento.pedido_entrega_em.slice(0, 10) : '');
      setSelecionados(r.itens.filter((it) => !it.ordem).map((it) => it.index));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os itens.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (aberto) void carregar();
    if (!aberto) {
      setDados(null);
      setPedido('');
      setEntrega('');
      setSelecionados([]);
      setErro(null);
      setSucesso(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, orcamento?.id]);

  const podeGerar = useMemo(() => {
    return dados?.orcamento.status === 'enviado' && pedido.trim().length > 0 && selecionados.length > 0;
  }, [dados?.orcamento.status, pedido, selecionados.length]);

  if (!aberto || !orcamento) return null;

  async function salvarPedido() {
    if (!orcamento) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.put(`/orcamentos/${orcamento.id}/pedido`, { gc_pedido_codigo: pedido.trim(), pedido_entrega_em: entrega || null });
      await carregar();
      onAtualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar o pedido.');
    } finally {
      setSalvando(false);
    }
  }

  async function gerarOrdens() {
    if (!orcamento || !podeGerar) return;
    setGerando(true);
    setErro(null);
    try {
      if (pedido.trim() !== dados?.orcamento.gc_pedido_codigo || entrega !== (dados?.orcamento.pedido_entrega_em?.slice(0, 10) ?? '')) {
        await api.put(`/orcamentos/${orcamento.id}/pedido`, { gc_pedido_codigo: pedido.trim(), pedido_entrega_em: entrega || null });
      }
      await api.post(`/orcamentos/${orcamento.id}/ordens-producao`, { itens: selecionados });
      await carregar();
      onAtualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao gerar as ordens.');
    } finally {
      setGerando(false);
    }
  }

  function toggle(index: number) {
    setSelecionados((prev) => prev.includes(index) ? prev.filter((v) => v !== index) : [...prev, index]);
  }

  function abrirPdf(id: string) {
    window.open(`/api/orcamentos/ordens-producao/${id}/pdf`, '_blank', 'noopener,noreferrer');
  }

  async function imprimirEtiqueta(ordem: OrdemProducao) {
    setImprimindoId(ordem.id);
    setErro(null);
    setSucesso(null);
    try {
      await api.post(`/orcamentos/ordens-producao/${ordem.id}/imprimir-etiqueta`);
      setSucesso(`Etiqueta ${ordem.codigo} enviada para impressão.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao imprimir etiqueta.');
    } finally {
      setImprimindoId(null);
    }
  }

  function documentos(ordem: OrdemProducao) {
    return (
      <div style={{ minWidth: 0 }}>
        <div className="font-mono text-sm-ui mb-1" style={{ overflowWrap: 'anywhere' }}>{ordem.codigo}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, width: '100%' }}>
          <button type="button" className="btn btn-info btn-xs" onClick={() => abrirPdf(ordem.id)} title="Abrir ordem de serviço em PDF">
            <FontAwesomeIcon icon={faFilePdf} /> OS
          </button>
          <button
            type="button"
            className="btn btn-default btn-xs"
            disabled={imprimindoId === ordem.id}
            onClick={() => void imprimirEtiqueta(ordem)}
            title="Imprimir etiqueta na Zebra"
          >
            <FontAwesomeIcon icon={faTag} /> {imprimindoId === ordem.id ? '...' : 'Etiqueta'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' }}
      onClick={onFechar}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 920, width: 'calc(100vw - 32px)', maxHeight: '88vh', overflow: 'auto', boxShadow: 'var(--shadow-modal)', zIndex: 200, boxSizing: 'border-box' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-lg-ui font-bold">Gerar Ordem de Produção</div>
            <div className="text-sm-ui text-neutral-600">
              Orçamento <span className="font-mono">{orcamento.gc_codigo ?? orcamento.gc_orcamento_id ?? '-'}</span> · {orcamento.nome_cliente}
            </div>
          </div>
          <button type="button" className="btn btn-default btn-xs" onClick={onFechar}>Fechar</button>
        </div>

        {erro && <div className="alert alert-danger mb-3">{erro}</div>}
        {sucesso && <div className="alert alert-success mb-3">{sucesso}</div>}

        {orcamento.status !== 'enviado' && (
          <div className="alert alert-warning mb-3">
            A ordem de produção só pode ser gerada para orçamentos enviados ao GestãoClick.
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div style={{ minWidth: 220, flex: '1 1 220px', maxWidth: 260 }}>
            <label className="form-label" htmlFor="pedido-producao">Nº Pedido</label>
            <input
              id="pedido-producao"
              className="input"
              value={pedido}
              disabled={orcamento.status !== 'enviado'}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="Informe o número do pedido"
            />
          </div>
          <button type="button" className="btn btn-default" disabled={salvando || orcamento.status !== 'enviado' || !pedido.trim()} onClick={salvarPedido}>
            {salvando ? 'Salvando...' : 'Salvar Pedido'}
          </button>
          <div style={{ minWidth: 180, flex: '1 1 180px', maxWidth: 220 }}>
            <label className="form-label" htmlFor="entrega-producao">Data de entrega</label>
            <input
              id="entrega-producao"
              type="date"
              className="input"
              value={entrega}
              disabled={orcamento.status !== 'enviado'}
              onChange={(e) => setEntrega(e.target.value)}
            />
          </div>
        </div>

        <div className="table-scroll hidden lg:block" style={{ border: '1px solid #dee2e6', borderRadius: 3, maxWidth: '100%' }}>
          <table className="data-table" style={{ minWidth: 0, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 42 }} />
              <col style={{ width: '31%' }} />
              <col style={{ width: '27%' }} />
              <col style={{ width: 146 }} />
              <col style={{ width: 190 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 42, padding: 10 }} />
                <th style={{ padding: 10, textAlign: 'left' }}>Produto</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Tecido</th>
                <th style={{ padding: 10, textAlign: 'left', width: 140 }}>Medidas</th>
                <th style={{ padding: 10, textAlign: 'left', width: 190 }}>Documentos</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={5} style={{ padding: 16 }}>Carregando itens...</td></tr>
              ) : (dados?.itens.length ?? 0) === 0 ? (
                <tr><td colSpan={5} style={{ padding: 16, color: '#6c757d' }}>Nenhum produto encontrado no orçamento.</td></tr>
              ) : (
                dados?.itens.map(({ index, item, ordem }) => (
                  <tr key={index} style={{ borderTop: '1px solid #dee2e6' }}>
                    <td style={{ padding: 10 }}>
                      <input
                        type="checkbox"
                        checked={selecionados.includes(index)}
                        disabled={Boolean(ordem) || orcamento.status !== 'enviado'}
                        onChange={() => toggle(index)}
                        aria-label={`Selecionar item ${index + 1}`}
                      />
                    </td>
                    <td style={{ padding: 10 }}>
                      <div className="td-strong">{item.ambiente || `Item ${index + 1}`}</div>
                      <div className="text-sm-ui text-neutral-600" style={{ overflowWrap: 'anywhere' }}>{produtoLabel(item)}</div>
                    </td>
                    <td style={{ padding: 10, overflowWrap: 'anywhere' }} className="text-sm-ui">{item.tecido_nome}</td>
                    <td style={{ padding: 10 }} className="font-mono text-sm-ui">
                      {medida(item.largura_m)} x {medida(item.altura_m)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {ordem ? (
                        documentos(ordem)
                      ) : (
                        <span className="text-sm-ui text-neutral-500">Ainda não gerada</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden" style={{ border: '1px solid #dee2e6', borderRadius: 3 }}>
          {carregando ? (
            <div style={{ padding: 16 }}>Carregando itens...</div>
          ) : (dados?.itens.length ?? 0) === 0 ? (
            <div style={{ padding: 16, color: '#6c757d' }}>Nenhum produto encontrado no orçamento.</div>
          ) : (
            dados?.itens.map(({ index, item, ordem }) => (
              <div key={index} style={{ padding: 12, borderTop: index === 0 ? undefined : '1px solid #dee2e6' }}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(index)}
                    disabled={Boolean(ordem) || orcamento.status !== 'enviado'}
                    onChange={() => toggle(index)}
                    aria-label={`Selecionar item ${index + 1}`}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="td-strong">{item.ambiente || `Item ${index + 1}`}</div>
                    <div className="text-sm-ui text-neutral-600" style={{ overflowWrap: 'anywhere' }}>{produtoLabel(item)}</div>
                    <div className="text-sm-ui mt-1" style={{ overflowWrap: 'anywhere' }}>{item.tecido_nome}</div>
                    <div className="font-mono text-sm-ui mt-1">{medida(item.largura_m)} x {medida(item.altura_m)}</div>
                    <div className="mt-2">{ordem ? documentos(ordem) : <span className="text-sm-ui text-neutral-500">Ainda não gerada</span>}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
          <button
            type="button"
            className="btn btn-default"
            disabled={orcamento.status !== 'enviado' || !dados}
            onClick={() => setSelecionados(dados?.itens.filter((it) => !it.ordem).map((it) => it.index) ?? [])}
          >
            Selecionar pendentes
          </button>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="btn btn-default" onClick={onFechar}>Cancelar</button>
            <button type="button" className="btn btn-success" disabled={!podeGerar || gerando} onClick={gerarOrdens}>
              {gerando ? 'Gerando...' : 'Gerar OS e Etiquetas'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
