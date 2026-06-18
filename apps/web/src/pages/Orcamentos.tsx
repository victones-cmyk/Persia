// apps/web/src/pages/Orcamentos.tsx
// Listagem de orçamentos (SRD §8): filtros de status, busca por cliente (debounced),
// tabela paginada (20/pág), ações ver/reenviar/cancelar.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEye, faPen, faRotateRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { formatBRL } from '../lib/formatacao';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import type { OrcamentoListItem, Paginacao, StatusOrcamento } from '../lib/orcamentoTypes';

const FILTROS: { valor: '' | StatusOrcamento; label: string }[] = [
  { valor: '', label: 'Todos' },
  { valor: 'enviado', label: 'Enviado' },
  { valor: 'erro', label: 'Erro' },
  { valor: 'rascunho', label: 'Rascunho' },
  { valor: 'cancelado', label: 'Cancelado' },
];

function tipoLabel(t: string): string {
  return t === 'cortina' ? 'Cortina' : 'Persiana';
}

function dataBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

export function Orcamentos() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [status, setStatus] = useState<'' | StatusOrcamento>('');
  const [cliente, setCliente] = useState('');
  const [pagina, setPagina] = useState(1);
  const [orcamentos, setOrcamentos] = useState<OrcamentoListItem[]>([]);
  const [pag, setPag] = useState<Paginacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmId, setAcaoEmId] = useState<string | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({ pagina: String(pagina) });
      if (status) params.set('status', status);
      if (cliente.trim()) params.set('cliente', cliente.trim());
      const r = await api.get<{ orcamentos: OrcamentoListItem[]; paginacao: Paginacao }>(
        `/orcamentos?${params.toString()}`,
      );
      setOrcamentos(r.orcamentos);
      setPag(r.paginacao);
    } catch {
      setOrcamentos([]);
    } finally {
      setCarregando(false);
    }
  }, [pagina, status, cliente]);

  // Debounce 300ms na busca por cliente; status/página recarregam na hora.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(carregar, cliente ? 300 : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [carregar, cliente]);

  async function reenviar(id: string) {
    setAcaoEmId(id);
    try {
      await api.post(`/orcamentos/${id}/reenviar`);
      showToast('success', 'Orçamento reenviado ao GestãoClick');
      carregar();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.data as { erro?: { message?: string } } | null)?.erro?.message ?? e.message : 'Falha';
      showToast('error', 'Falha ao reenviar', msg);
      carregar();
    } finally {
      setAcaoEmId(null);
    }
  }

  async function executarCancelar(id: string) {
    setCancelarId(null);
    setAcaoEmId(id);
    try {
      await api.post(`/orcamentos/${id}/cancelar`);
      showToast('info', 'Orçamento cancelado');
      carregar();
    } catch {
      showToast('error', 'Falha ao cancelar');
    } finally {
      setAcaoEmId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl-ui font-bold text-neutral-800">Orçamentos</h1>
        <Link to="/orcamentos/novo" className="btn btn-success">
          <FontAwesomeIcon icon={faPlus} /> Criar Orçamento
        </Link>
      </div>

      {/* Filtros + busca */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex gap-0">
            {FILTROS.map((f, i) => {
              const ativo = status === f.valor;
              return (
                <button
                  key={f.valor || 'todos'}
                  type="button"
                  onClick={() => {
                    setStatus(f.valor);
                    setPagina(1);
                  }}
                  className="text-xs-ui"
                  style={{
                    height: 28,
                    padding: '0 12px',
                    border: '1px solid ' + (ativo ? '#008d4c' : '#dee2e6'),
                    background: ativo ? '#00a65a' : '#fff',
                    color: ativo ? '#fff' : '#6c757d',
                    borderRadius: i === 0 ? '3px 0 0 3px' : i === FILTROS.length - 1 ? '0 3px 3px 0' : 0,
                    borderLeft: i === 0 ? undefined : 'none',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Buscar por cliente…"
            value={cliente}
            onChange={(e) => {
              setCliente(e.target.value);
              setPagina(1);
            }}
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 150 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
              <Th>Nº GestãoClick</Th>
              <Th>Cliente</Th>
              <Th>Tipo</Th>
              <Th>Valor Final</Th>
              <Th>Status</Th>
              <Th>Data</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #dee2e6' }}>
                  <td colSpan={7} style={{ padding: 12 }}>
                    <div className="skeleton" style={{ height: 18 }} />
                  </td>
                </tr>
              ))
            ) : orcamentos.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#6c757d' }}>
                  Nenhum orçamento encontrado.
                </td>
              </tr>
            ) : (
              orcamentos.map((o) => (
                <tr key={o.id} style={{ borderTop: '1px solid #dee2e6' }} className="hover:bg-neutral-100">
                  <td style={{ padding: 12 }} className="font-mono tabular-nums text-sm-ui" title="Nº do orçamento no GestãoClick">
                    {o.gc_codigo ?? o.gc_orcamento_id ?? '—'}
                  </td>
                  <td style={{ padding: 12 }} className="td-strong">{o.nome_cliente}</td>
                  <td style={{ padding: 12 }} className="text-sm-ui text-neutral-600">{tipoLabel(o.tipo_produto)}</td>
                  <td style={{ padding: 12 }} className="font-mono tabular-nums">{formatBRL(Number(o.valor_final))}</td>
                  <td style={{ padding: 12 }}><StatusBadge status={o.status} /></td>
                  <td style={{ padding: 12 }} className="text-sm-ui text-neutral-500">{dataBR(o.criado_em)}</td>
                  <td style={{ padding: 12 }}>
                    <div className="flex gap-1">
                      <button className="btn btn-info btn-xs" onClick={() => navigate(`/orcamentos/${o.id}`)} title="Visualizar">
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button
                        className="btn btn-warning btn-xs"
                        disabled={o.status !== 'rascunho'}
                        onClick={() => navigate(`/orcamentos/novo?editar=${o.id}`)}
                        title={o.status === 'rascunho' ? 'Editar' : 'Só é possível editar orçamentos em rascunho'}
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      {o.status === 'erro' && (
                        <button className="btn btn-warning btn-xs" disabled={acaoEmId === o.id} onClick={() => reenviar(o.id)} title="Reenviar">
                          <FontAwesomeIcon icon={faRotateRight} />
                        </button>
                      )}
                      {o.status !== 'cancelado' && (
                        <button className="btn btn-danger btn-xs" disabled={acaoEmId === o.id} onClick={() => setCancelarId(o.id)} title="Cancelar orçamento">
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {pag && pag.totalPaginas > 1 && (
        <div className="flex items-center gap-1 mt-4">
          {Array.from({ length: pag.totalPaginas }).map((_, i) => {
            const p = i + 1;
            const ativo = p === pag.pagina;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPagina(p)}
                style={{
                  padding: '.5rem .75rem',
                  background: ativo ? '#000' : '#fff',
                  color: ativo ? '#fff' : '#6c757d',
                  border: '1px solid ' + (ativo ? '#000' : '#dee2e6'),
                  borderRadius: 3,
                  fontSize: 14,
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
      )}

      <ConfirmModal
        aberto={cancelarId !== null}
        titulo="Cancelar orçamento"
        mensagem="Deseja cancelar este orçamento? Isso afeta apenas a Pérsia — não altera nada no GestãoClick."
        confirmarLabel="Cancelar orçamento"
        cancelarLabel="Voltar"
        perigo
        onConfirmar={() => cancelarId && void executarCancelar(cancelarId)}
        onCancelar={() => setCancelarId(null)}
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: 12, textAlign: 'left', fontWeight: 700 }}>{children}</th>;
}
