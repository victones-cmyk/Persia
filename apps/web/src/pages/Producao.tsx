import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faFilePdf, faIndustry, faPrint, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { EtiquetaPreviewModal, type EtiquetaPreviewOrdem } from '../components/EtiquetaPreviewModal';

type StatusOrdem = 'criada' | 'impressa' | 'cancelada';
type FiltroStatus = StatusOrdem | 'sem_os';
type TipoDocumento = 'persiana' | 'cortina';

interface PedidoSemOs {
  id: string;
  tipo_produto: string;
  nome_cliente: string;
  gc_codigo: string | null;
  gc_orcamento_id: string | null;
  gc_pedido_codigo: string | null;
  pedido_confirmado_em: string | null;
  pedido_entrega_em: string | null;
  valor_final: string;
  loja_nome: string | null;
  vendedor_nome: string | null;
  total_itens: number;
  itens_pendentes: number;
}

function tipoProdutoLabel(t: string): string {
  if (t === 'cortina') return 'Cortina';
  if (t === 'misto') return 'Misto';
  return 'Persiana';
}

interface OrdemCentral extends EtiquetaPreviewOrdem {
  item_index: number;
  tipo_documento: TipoDocumento;
  status: StatusOrdem;
  criado_em: string;
  impresso_em: string | null;
  gerado_por: string;
  orcamento: NonNullable<EtiquetaPreviewOrdem['orcamento']> & {
    id: string;
    status: string;
    gc_codigo: string | null;
    gc_orcamento_id: string | null;
    gc_pedido_codigo: string | null;
    loja_nome: string | null;
    vendedor_nome: string | null;
  };
}

interface ResumoProducao {
  total: number;
  criadas: number;
  impressas: number;
  canceladas: number;
  persianas: number;
  cortinas: number;
  atrasadas: number;
  entregaHoje: number;
}

const STATUS: Array<{ valor: '' | FiltroStatus; label: string }> = [
  { valor: '', label: 'Todas' },
  { valor: 'criada', label: 'Pendentes' },
  { valor: 'impressa', label: 'Impressas' },
  { valor: 'cancelada', label: 'Canceladas' },
  { valor: 'sem_os', label: 'Sem OS gerada' },
];

const TIPOS: Array<{ valor: '' | TipoDocumento; label: string }> = [
  { valor: '', label: 'Todos os tipos' },
  { valor: 'persiana', label: 'Persianas' },
  { valor: 'cortina', label: 'Cortinas' },
];

function dataCurta(v: string | null | undefined): string {
  if (!v) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(v));
}

function dataHora(v: string | null | undefined): string {
  if (!v) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v));
}

function medida(ordem: OrdemCentral): string {
  const item = ordem.item_snapshot_json;
  const largura = Number(item?.largura_m);
  const altura = Number(item?.altura_m);
  if (!Number.isFinite(largura) || !Number.isFinite(altura)) return '-';
  return `${largura.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} x ${altura.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function statusBadge(status: StatusOrdem) {
  const mapa: Record<StatusOrdem, { label: string; bg: string; color: string; border: string }> = {
    criada: { label: 'Pendente', bg: '#fff3cd', color: '#856404', border: '#ffeeba' },
    impressa: { label: 'Impressa', bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
    cancelada: { label: 'Cancelada', bg: '#e9ecef', color: '#495057', border: '#dee2e6' },
  };
  const s = mapa[status];
  return <span className="badge" style={{ background: s.bg, color: s.color, borderColor: s.border }}>{s.label}</span>;
}

function tipoBadge(tipo: TipoDocumento) {
  return (
    <span className="badge badge-secondary">
      {tipo === 'persiana' ? 'Persiana' : 'Cortina'}
    </span>
  );
}

function ResumoCard({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="card" style={{ padding: 12, minWidth: 132, flex: '1 1 132px' }}>
      <div className="text-2xs-ui font-bold uppercase text-neutral-500">{label}</div>
      <div className="text-xl-ui font-bold text-neutral-800">{valor}</div>
    </div>
  );
}

export function Producao() {
  const [status, setStatus] = useState<'' | FiltroStatus>('criada');
  const [tipo, setTipo] = useState<'' | TipoDocumento>('');
  const [busca, setBusca] = useState('');
  const [entregaDe, setEntregaDe] = useState('');
  const [entregaAte, setEntregaAte] = useState('');
  const [ordens, setOrdens] = useState<OrdemCentral[]>([]);
  const [resumo, setResumo] = useState<ResumoProducao | null>(null);
  const [pedidosSemOs, setPedidosSemOs] = useState<PedidoSemOs[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [previa, setPrevia] = useState<OrdemCentral | null>(null);
  const [imprimindoId, setImprimindoId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modoSemOs = status === 'sem_os';

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.set('q', busca.trim());
      if (entregaDe) params.set('entrega_de', entregaDe);
      if (entregaAte) params.set('entrega_ate', entregaAte);
      if (modoSemOs) {
        const r = await api.get<{ total: number; pedidos: PedidoSemOs[] }>(`/orcamentos/pedidos-sem-os?${params.toString()}`);
        setPedidosSemOs(r.pedidos);
        setOrdens([]);
        setResumo(null);
      } else {
        if (status) params.set('status', status);
        if (tipo) params.set('tipo', tipo);
        const r = await api.get<{ resumo: ResumoProducao; ordens: OrdemCentral[] }>(`/orcamentos/ordens-producao?${params.toString()}`);
        setResumo(r.resumo);
        setOrdens(r.ordens);
        setPedidosSemOs([]);
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a produção.');
      setOrdens([]);
      setResumo(null);
      setPedidosSemOs([]);
    } finally {
      setCarregando(false);
    }
  }, [status, tipo, busca, entregaDe, entregaAte, modoSemOs]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(carregar, busca ? 300 : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [carregar, busca]);

  const ordenadas = useMemo(() => {
    return [...ordens].sort((a, b) => {
      const ea = a.orcamento.pedido_entrega_em ? new Date(a.orcamento.pedido_entrega_em).getTime() : Number.MAX_SAFE_INTEGER;
      const eb = b.orcamento.pedido_entrega_em ? new Date(b.orcamento.pedido_entrega_em).getTime() : Number.MAX_SAFE_INTEGER;
      return ea - eb || a.codigo.localeCompare(b.codigo);
    });
  }, [ordens]);

  function abrirPdf(id: string) {
    window.open(`/api/orcamentos/ordens-producao/${id}/pdf`, '_blank', 'noopener,noreferrer');
  }

  async function imprimirEtiqueta(ordem: OrdemCentral) {
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

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl-ui font-bold text-neutral-800">Central de Produção</h1>
          <div className="text-sm-ui text-neutral-600">Filas de OS, entrega, A4 e etiquetas</div>
        </div>
        <button type="button" className="btn btn-default" disabled={carregando} onClick={() => void carregar()}>
          <FontAwesomeIcon icon={faRotateRight} /> Atualizar
        </button>
      </div>

      {erro && <div className="alert alert-error mb-3">{erro}</div>}
      {sucesso && <div className="alert alert-success mb-3">{sucesso}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {modoSemOs ? (
          <ResumoCard label="Pedidos sem OS" valor={pedidosSemOs.length} />
        ) : (
          <>
            <ResumoCard label="Total" valor={resumo?.total ?? 0} />
            <ResumoCard label="Pendentes" valor={resumo?.criadas ?? 0} />
            <ResumoCard label="Impressas" valor={resumo?.impressas ?? 0} />
            <ResumoCard label="Atrasadas" valor={resumo?.atrasadas ?? 0} />
            <ResumoCard label="Hoje" valor={resumo?.entregaHoje ?? 0} />
            <ResumoCard label="Persianas" valor={resumo?.persianas ?? 0} />
            <ResumoCard label="Cortinas" valor={resumo?.cortinas ?? 0} />
          </>
        )}
      </div>

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div style={{ width: 170 }}>
            <label className="form-label" htmlFor="producao-status">Status</label>
            <select id="producao-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as '' | FiltroStatus)}>
              {STATUS.map((s) => <option key={s.valor || 'todos'} value={s.valor}>{s.label}</option>)}
            </select>
          </div>
          {!modoSemOs && (
            <div style={{ width: 180 }}>
              <label className="form-label" htmlFor="producao-tipo">Tipo</label>
              <select id="producao-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as '' | TipoDocumento)}>
                {TIPOS.map((t) => <option key={t.valor || 'todos'} value={t.valor}>{t.label}</option>)}
              </select>
            </div>
          )}
          <div style={{ width: 150 }}>
            <label className="form-label" htmlFor="producao-de">Entrega de</label>
            <input id="producao-de" type="date" className="input" value={entregaDe} onChange={(e) => setEntregaDe(e.target.value)} />
          </div>
          <div style={{ width: 150 }}>
            <label className="form-label" htmlFor="producao-ate">Entrega até</label>
            <input id="producao-ate" type="date" className="input" value={entregaAte} onChange={(e) => setEntregaAte(e.target.value)} />
          </div>
          <div style={{ minWidth: 240, flex: '1 1 260px' }}>
            <label className="form-label" htmlFor="producao-busca">Busca</label>
            <input id="producao-busca" className="input" placeholder="Cliente, pedido, ambiente, tecido…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
      </div>

      {modoSemOs ? (
        <div className="card p-0 table-scroll">
          <table className="data-table" style={{ minWidth: 980 }}>
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                <Th>Entrega</Th>
                <Th>Pedido</Th>
                <Th>Cliente</Th>
                <Th>Tipo</Th>
                <Th>Itens pendentes</Th>
                <Th>Confirmado em</Th>
                <Th className="table-actions">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {carregando && pedidosSemOs.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #dee2e6' }}>
                    <td colSpan={7} style={{ padding: 12 }}><div className="skeleton" style={{ height: 18 }} /></td>
                  </tr>
                ))
              ) : pedidosSemOs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 18, color: '#6c757d' }}>
                    Nenhum pedido confirmado com item sem OS.
                  </td>
                </tr>
              ) : (
                pedidosSemOs.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #dee2e6' }}>
                    <Td className="font-mono">{dataCurta(p.pedido_entrega_em)}</Td>
                    <Td>
                      <div className="font-mono">{p.gc_pedido_codigo}</div>
                      <div className="text-xs-ui text-neutral-500">Orç. {p.gc_codigo ?? p.gc_orcamento_id ?? '-'}</div>
                    </Td>
                    <Td>
                      <div className="td-strong" style={{ overflowWrap: 'anywhere' }}>{p.nome_cliente}</div>
                      <div className="text-xs-ui text-neutral-500">{p.loja_nome ?? '-'} · {p.vendedor_nome ?? '-'}</div>
                    </Td>
                    <Td><span className="badge badge-secondary">{tipoProdutoLabel(p.tipo_produto)}</span></Td>
                    <Td className="font-mono text-sm-ui">{p.itens_pendentes} de {p.total_itens}</Td>
                    <Td className="text-sm-ui">{dataHora(p.pedido_confirmado_em)}</Td>
                    <Td className="table-actions">
                      <Link className="btn btn-info btn-xs" to={`/orcamentos?abrirOS=${p.id}`} title="Abrir pedido e gerar OS">
                        <FontAwesomeIcon icon={faIndustry} /> Gerar OS
                      </Link>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="card p-0 table-scroll">
        <table className="data-table" style={{ minWidth: 1180 }}>
          <colgroup>
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 270 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
              <Th>Entrega</Th>
              <Th>Pedido</Th>
              <Th>Cliente / Produto</Th>
              <Th>Tipo</Th>
              <Th>Medida</Th>
              <Th>Status</Th>
              <Th>Impressão</Th>
              <Th className="table-actions">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {carregando && ordenadas.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #dee2e6' }}>
                  <td colSpan={8} style={{ padding: 12 }}><div className="skeleton" style={{ height: 18 }} /></td>
                </tr>
              ))
            ) : ordenadas.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 18, color: '#6c757d' }}>
                  Nenhuma OS encontrada para os filtros atuais.
                </td>
              </tr>
            ) : (
              ordenadas.map((ordem) => (
                <tr key={ordem.id} style={{ borderTop: '1px solid #dee2e6' }}>
                  <Td className="font-mono">{dataCurta(ordem.orcamento.pedido_entrega_em)}</Td>
                  <Td>
                    <div className="font-mono">{ordem.gc_pedido_codigo}</div>
                    <div className="text-xs-ui text-neutral-500">{ordem.codigo}</div>
                  </Td>
                  <Td>
                    <div className="td-strong" style={{ overflowWrap: 'anywhere' }}>{ordem.orcamento.nome_cliente}</div>
                    <div className="text-sm-ui text-neutral-600" style={{ overflowWrap: 'anywhere' }}>
                      {ordem.item_snapshot_json?.ambiente || `Item ${ordem.item_index + 1}`} · {ordem.item_snapshot_json?.nome_produto || ordem.item_snapshot_json?.tipo || 'Produto'}
                    </div>
                    <div className="text-xs-ui text-neutral-500">{ordem.orcamento.loja_nome ?? '-'} · {ordem.orcamento.vendedor_nome ?? '-'}</div>
                  </Td>
                  <Td>{tipoBadge(ordem.tipo_documento)}</Td>
                  <Td className="font-mono text-sm-ui">{medida(ordem)}</Td>
                  <Td>{statusBadge(ordem.status)}</Td>
                  <Td>
                    <div className="text-sm-ui">{ordem.impresso_em ? dataHora(ordem.impresso_em) : 'Não impressa'}</div>
                    <div className="text-xs-ui text-neutral-500">Gerada: {dataHora(ordem.criado_em)}</div>
                  </Td>
                  <Td className="table-actions">
                    <div className="table-actions-row" style={{ flexWrap: 'wrap', minWidth: 0 }}>
                      <button type="button" className="btn btn-info btn-xs" onClick={() => abrirPdf(ordem.id)} title="Abrir OS A4">
                        <FontAwesomeIcon icon={faFilePdf} /> OS
                      </button>
                      <button type="button" className="btn btn-info btn-xs" onClick={() => setPrevia(ordem)} title="Prévia da etiqueta">
                        <FontAwesomeIcon icon={faEye} /> Prévia
                      </button>
                      <button type="button" className="btn btn-default btn-xs" disabled={imprimindoId === ordem.id} onClick={() => void imprimirEtiqueta(ordem)} title="Imprimir etiqueta">
                        <FontAwesomeIcon icon={faPrint} /> {imprimindoId === ordem.id ? '...' : 'Etiqueta'}
                      </button>
                      <Link className="btn btn-default btn-xs" to={`/orcamentos/${ordem.orcamento.id}`} title="Abrir orçamento">
                        <FontAwesomeIcon icon={faIndustry} /> Orçamento
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      <EtiquetaPreviewModal
        ordem={previa}
        imprimindo={previa ? imprimindoId === previa.id : false}
        onImprimir={(ordem) => {
          const origem = ordens.find((op) => op.id === ordem.id);
          if (origem) void imprimirEtiqueta(origem);
        }}
        onFechar={() => setPrevia(null)}
      />
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={className} style={{ padding: 12, textAlign: 'left', background: '#f8f9fa' }}>{children}</th>;
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={className} style={{ padding: 12, verticalAlign: 'top' }}>{children}</td>;
}
