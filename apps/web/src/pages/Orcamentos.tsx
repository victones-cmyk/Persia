// apps/web/src/pages/Orcamentos.tsx
// Listagem de orçamentos (SRD §8): filtros de status, busca por cliente (debounced),
// tabela paginada (20/pág), ações ver/reenviar/cancelar.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEye, faPen, faRotateRight, faXmark, faCopy, faIndustry, faFileInvoiceDollar, faCircleExclamation } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { formatBRL } from '../lib/formatacao';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import type { OrcamentoListItem, Paginacao, StatusOrcamento } from '../lib/orcamentoTypes';
import { lerFiltrosOrcamento, salvarFiltrosOrcamento } from '../lib/filtrosSessao';
import { parseBR } from '../lib/dataBR';
import { PeriodoRange } from '../components/PeriodoRange';
import { ProducaoModal } from '../components/ProducaoModal';

const FILTROS: { valor: '' | StatusOrcamento; label: string }[] = [
  { valor: '', label: 'Todos' },
  { valor: 'enviado', label: 'Enviado' },
  { valor: 'erro', label: 'Erro' },
  { valor: 'rascunho', label: 'Rascunho' },
  { valor: 'cancelado', label: 'Cancelado' },
];

function tipoLabel(t: string): string {
  return t === 'cortina' ? 'Cortina' : t === 'misto' ? 'Misto' : 'Persiana';
}

function dataBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

// --- Filtro de data (calculado no fuso local do usuário) ---
type Periodo = 'todos' | 'hoje' | 'este_mes' | 'mes_passado' | 'custom';

const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: 'todos', label: 'Todo o período' },
  { valor: 'hoje', label: 'Hoje' },
  { valor: 'este_mes', label: 'Este mês' },
  { valor: 'mes_passado', label: 'Mês passado' },
  { valor: 'custom', label: 'Escolha o período…' },
];

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
/** Resolve o período escolhido em instantes {inicio, fim} (ou null quando não filtra). */
function intervaloDoPeriodo(p: Periodo, de: string, ate: string): { inicio: Date | null; fim: Date | null } {
  const agora = new Date();
  switch (p) {
    case 'hoje':
      return { inicio: inicioDoDia(agora), fim: fimDoDia(agora) };
    case 'este_mes':
      return {
        inicio: new Date(agora.getFullYear(), agora.getMonth(), 1),
        fim: fimDoDia(new Date(agora.getFullYear(), agora.getMonth() + 1, 0)),
      };
    case 'mes_passado':
      return {
        inicio: new Date(agora.getFullYear(), agora.getMonth() - 1, 1),
        fim: fimDoDia(new Date(agora.getFullYear(), agora.getMonth(), 0)),
      };
    case 'custom': {
      // Só filtra quando AMBAS as datas estiverem completas e válidas (De e Até).
      const di = parseBR(de);
      const df = parseBR(ate);
      if (!di || !df) return { inicio: null, fim: null };
      return { inicio: inicioDoDia(di), fim: fimDoDia(df) };
    }
    default:
      return { inicio: null, fim: null };
  }
}

// Validação dos filtros lidos da URL (persistência ao atualizar a página).
function periodoValido(v: string | null): Periodo {
  return PERIODOS.some((p) => p.valor === v) ? (v as Periodo) : 'todos';
}
function statusValido(v: string | null): '' | StatusOrcamento {
  const s = v ?? '';
  return FILTROS.some((f) => f.valor === s) ? (s as '' | StatusOrcamento) : '';
}

interface OrcamentosProps {
  modo?: 'orcamentos' | 'vendas';
}

export function Orcamentos({ modo = 'orcamentos' }: OrcamentosProps) {
  const somenteVendas = modo === 'vendas';
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Filtros persistidos na SESSÃO (sessionStorage): mantêm-se ao atualizar a página,
  // mas zeram no login/logout (limpos por limparFiltrosOrcamento em useAuth).
  const salvos = lerFiltrosOrcamento();
  const [status, setStatus] = useState<'' | StatusOrcamento>(() => statusValido(salvos?.status ?? null));
  const [cliente, setCliente] = useState(() => salvos?.cliente ?? '');
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoValido(salvos?.periodo ?? null));
  const [dataDe, setDataDe] = useState(() => salvos?.dataDe ?? '');
  const [dataAte, setDataAte] = useState(() => salvos?.dataAte ?? '');
  const [pagina, setPagina] = useState(() => Math.max(1, Number(salvos?.pagina) || 1));
  const [orcamentos, setOrcamentos] = useState<OrcamentoListItem[]>([]);
  const [pag, setPag] = useState<Paginacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmId, setAcaoEmId] = useState<string | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [producaoOrc, setProducaoOrc] = useState<OrcamentoListItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({ pagina: String(pagina) });
      if (somenteVendas) params.set('vendas', '1');
      if (!somenteVendas && status) params.set('status', status);
      if (cliente.trim()) params.set('cliente', cliente.trim());
      const { inicio, fim } = intervaloDoPeriodo(periodo, dataDe, dataAte);
      if (inicio) params.set('data_inicio', inicio.toISOString());
      if (fim) params.set('data_fim', fim.toISOString());
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
  }, [pagina, status, cliente, periodo, dataDe, dataAte, somenteVendas]);

  // Debounce 300ms na busca por cliente; status/página recarregam na hora.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(carregar, cliente ? 300 : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [carregar, cliente]);

  // Persiste os filtros na sessão do navegador (some no login/logout).
  useEffect(() => {
    salvarFiltrosOrcamento({ status, cliente, periodo, dataDe, dataAte, pagina });
  }, [status, cliente, periodo, dataDe, dataAte, pagina]);

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

  async function duplicar(id: string) {
    setAcaoEmId(id);
    try {
      const r = await api.post<{ orcamento: { id: string } }>(`/orcamentos/${id}/duplicar`);
      showToast('success', 'Orçamento duplicado', 'A cópia foi criada como rascunho.');
      navigate(`/orcamentos/novo?editar=${r.orcamento.id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.data as { message?: string; erro?: { message?: string } } | null)?.erro?.message ?? (e.data as { message?: string } | null)?.message ?? e.message : 'Tente novamente.';
      showToast('error', 'Falha ao duplicar', msg);
      carregar();
    } finally {
      setAcaoEmId(null);
    }
  }

  async function gerarVenda(id: string) {
    setAcaoEmId(id);
    try {
      const r = await api.post<{ orcamento: OrcamentoListItem; ja_existia?: boolean }>(`/orcamentos/${id}/gerar-venda`);
      const codigo = r.orcamento.gc_pedido_codigo ?? r.orcamento.gc_pedido_id ?? '';
      showToast(
        'success',
        r.ja_existia ? 'Venda já gerada' : 'Venda gerada no GestãoClick',
        codigo ? `Pedido ${codigo}` : undefined,
      );
      carregar();
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.data as { erro?: { message?: string }; message?: string } | null)?.erro?.message
          ?? (e.data as { message?: string } | null)?.message
          ?? e.message
        : 'Tente novamente.';
      showToast('error', 'Falha ao gerar venda', msg);
      carregar();
    } finally {
      setAcaoEmId(null);
    }
  }

  async function copiarErro(o: OrcamentoListItem) {
    const texto = o.erro_gc || 'Erro não informado.';
    try {
      await navigator.clipboard.writeText(texto);
      showToast('success', 'Erro copiado');
    } catch {
      showToast('info', 'Erro do GestãoClick', texto);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl-ui font-bold text-neutral-800">{somenteVendas ? 'Vendas' : 'Orçamentos'}</h1>
        {!somenteVendas && (
          <Link to="/orcamentos/novo" className="btn btn-success">
            <FontAwesomeIcon icon={faPlus} /> Criar Orçamento
          </Link>
        )}
      </div>

      {/* Filtros + busca */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {!somenteVendas ? (
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
                    className="text-sm-ui"
                    style={{
                      height: 30,
                      padding: '0 14px',
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
          ) : (
            <div className="text-sm-ui text-neutral-600">
              Orçamentos transformados em venda no GestãoClick
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por data de criação: campos De/Até (dd/mm/aaaa) à esquerda do
                seletor de período; o filtro só é aplicado com AMBAS preenchidas. */}
            {periodo === 'custom' && (
              <PeriodoRange
                de={dataDe}
                ate={dataAte}
                onAplicar={(d, a) => {
                  setDataDe(d);
                  setDataAte(a);
                  setPagina(1);
                }}
              />
            )}
            {/* Seletor de período — imediatamente à esquerda da busca por cliente */}
            <select
              className="input"
              style={{ width: 180, flexShrink: 0 }}
              value={periodo}
              onChange={(e) => {
                setPeriodo(e.target.value as Periodo);
                setPagina(1);
              }}
              aria-label="Filtrar por período"
              title="Filtrar por data de criação"
            >
              {PERIODOS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ width: 260, flexShrink: 0 }}
              placeholder="Buscar por cliente…"
              value={cliente}
              onChange={(e) => {
                setCliente(e.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card p-0 table-scroll">
        <table className="data-table" style={{ minWidth: 1080 }}>
          <colgroup>
            <col style={{ width: 180 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 220 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
              <Th>Nº GestãoClick</Th>
              <Th>Nº Pedido</Th>
              <Th>Cliente</Th>
              <Th>Tipo</Th>
              <Th>Valor Final</Th>
              <Th>Status</Th>
              <Th>Data</Th>
              <Th className="table-actions">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {/* Esqueleto só no 1º carregamento (sem dados). Em recargas de filtro,
                mantém a lista atual até a nova chegar — evita o "pisca" da tela/paginação. */}
            {carregando && orcamentos.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #dee2e6' }}>
                  <td colSpan={8} style={{ padding: 12 }}>
                    <div className="skeleton" style={{ height: 18 }} />
                  </td>
                </tr>
              ))
            ) : orcamentos.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#6c757d' }}>
                  {somenteVendas ? 'Nenhuma venda encontrada.' : 'Nenhum orçamento encontrado.'}
                </td>
              </tr>
            ) : (
              orcamentos.map((o) => (
                <tr key={o.id} style={{ borderTop: '1px solid #dee2e6' }} className="hover:bg-neutral-100">
                  <td style={{ padding: 12 }} className="font-mono tabular-nums text-sm-ui" title="Nº do orçamento no GestãoClick">
                    {o.gc_codigo ?? o.gc_orcamento_id ?? '—'}
                  </td>
                  <td style={{ padding: 12 }} className="font-mono tabular-nums text-sm-ui" title="Nº do pedido/venda">
                    {o.gc_pedido_codigo ?? '—'}
                  </td>
                  <td style={{ padding: 12 }} className="td-strong">{o.nome_cliente}</td>
                  <td style={{ padding: 12 }} className="text-sm-ui text-neutral-600">{tipoLabel(o.tipo_produto)}</td>
                  <td style={{ padding: 12 }} className="font-mono tabular-nums">{formatBRL(Number(o.valor_final))}</td>
                  <td style={{ padding: 12 }}><StatusBadge status={o.status} /></td>
                  <td style={{ padding: 12 }} className="text-sm-ui text-neutral-500">{dataBR(o.criado_em)}</td>
                  <td style={{ padding: 12 }} className="table-actions">
                    <div className="table-actions-row">
                      <button className="btn btn-info btn-xs" onClick={() => navigate(`/orcamentos/${o.id}`)} title="Visualizar">
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button
                        className="btn btn-default btn-xs"
                        disabled={o.status !== 'enviado'}
                        onClick={() => setProducaoOrc(o)}
                        title={o.status === 'enviado' ? 'Gerar ordem de produção' : 'Produção apenas para orçamentos enviados'}
                      >
                        <FontAwesomeIcon icon={faIndustry} />
                      </button>
                      {!somenteVendas && (
                        <button
                          className="btn btn-success btn-xs"
                          disabled={o.status !== 'enviado' || Boolean(o.gc_pedido_codigo || o.gc_pedido_id) || acaoEmId === o.id}
                          onClick={() => gerarVenda(o.id)}
                          title={
                            o.status !== 'enviado'
                              ? 'Venda apenas para orçamentos enviados'
                              : o.gc_pedido_codigo || o.gc_pedido_id
                                ? 'Venda já gerada'
                                : 'Gerar venda no GestãoClick'
                          }
                        >
                          <FontAwesomeIcon icon={faFileInvoiceDollar} />
                        </button>
                      )}
                      <button className="btn btn-default btn-xs text-primary" disabled={acaoEmId === o.id} onClick={() => duplicar(o.id)} title="Duplicar como rascunho">
                        <FontAwesomeIcon icon={faCopy} />
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
                        <>
                          <button className="btn btn-default btn-xs text-danger" onClick={() => void copiarErro(o)} title={o.erro_gc || 'Copiar erro'}>
                            <FontAwesomeIcon icon={faCircleExclamation} />
                          </button>
                          <button className="btn btn-warning btn-xs" disabled={acaoEmId === o.id} onClick={() => reenviar(o.id)} title="Reenviar">
                            <FontAwesomeIcon icon={faRotateRight} />
                          </button>
                        </>
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

      <ProducaoModal
        aberto={producaoOrc !== null}
        orcamento={producaoOrc}
        onFechar={() => setProducaoOrc(null)}
        onAtualizar={carregar}
      />
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={className} style={{ padding: 12, textAlign: 'left', fontWeight: 700 }}>{children}</th>;
}

export function Vendas() {
  return <Orcamentos modo="vendas" />;
}
