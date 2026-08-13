import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxOpen, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { EstoqueSaidaModal } from '../components/EstoqueSaidaModal';

interface PedidoPendenteEstoque {
  id: string;
  tipo_produto: string;
  nome_cliente: string;
  gc_codigo: string | null;
  gc_orcamento_id: string | null;
  gc_pedido_codigo: string | null;
  pedido_entrega_em: string | null;
  valor_final: string;
  loja_nome: string | null;
  vendedor_nome: string | null;
  total_ordens: number;
  ordens_pendentes: number;
}

function tipoProdutoLabel(t: string): string {
  if (t === 'cortina') return 'Cortina';
  if (t === 'misto') return 'Misto';
  return 'Persiana';
}

function dataCurta(v: string | null | undefined): string {
  if (!v) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(v));
}

export function BaixaEstoque() {
  const [busca, setBusca] = useState('');
  const [entregaDe, setEntregaDe] = useState('');
  const [entregaAte, setEntregaAte] = useState('');
  const [pedidos, setPedidos] = useState<PedidoPendenteEstoque[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.set('q', busca.trim());
      if (entregaDe) params.set('entrega_de', entregaDe);
      if (entregaAte) params.set('entrega_ate', entregaAte);
      const r = await api.get<{ total: number; pedidos: PedidoPendenteEstoque[] }>(`/orcamentos/pendentes-estoque?${params.toString()}`);
      setPedidos(r.pedidos);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os pedidos pendentes de estoque.');
      setPedidos([]);
    } finally {
      setCarregando(false);
    }
  }, [busca, entregaDe, entregaAte]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(carregar, busca ? 300 : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [carregar, busca]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl-ui font-bold text-neutral-800">Baixa de Estoque</h1>
          <div className="text-sm-ui text-neutral-600">Pedidos com OS gerada que ainda não tiveram saída de estoque confirmada no GestãoClick</div>
        </div>
        <button type="button" className="btn btn-default" disabled={carregando} onClick={() => void carregar()}>
          <FontAwesomeIcon icon={faRotateRight} /> Atualizar
        </button>
      </div>

      {erro && <div className="alert alert-error mb-3">{erro}</div>}

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div style={{ width: 150 }}>
            <label className="form-label" htmlFor="estoque-de">Entrega de</label>
            <input id="estoque-de" type="date" className="input" value={entregaDe} onChange={(e) => setEntregaDe(e.target.value)} />
          </div>
          <div style={{ width: 150 }}>
            <label className="form-label" htmlFor="estoque-ate">Entrega até</label>
            <input id="estoque-ate" type="date" className="input" value={entregaAte} onChange={(e) => setEntregaAte(e.target.value)} />
          </div>
          <div style={{ minWidth: 240, flex: '1 1 260px' }}>
            <label className="form-label" htmlFor="estoque-busca">Busca</label>
            <input id="estoque-busca" className="input" placeholder="Cliente, pedido, orçamento…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-0 table-scroll">
        <table className="data-table" style={{ minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 160 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
              <Th>Entrega</Th>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Tipo</Th>
              <Th>OS pendentes</Th>
              <Th className="table-actions">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {carregando && pedidos.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #dee2e6' }}>
                  <td colSpan={6} style={{ padding: 12 }}><div className="skeleton" style={{ height: 18 }} /></td>
                </tr>
              ))
            ) : pedidos.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: '#6c757d' }}>
                  Nenhum pedido com estoque pendente de baixa.
                </td>
              </tr>
            ) : (
              pedidos.map((p) => (
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
                  <Td className="font-mono text-sm-ui">{p.ordens_pendentes} de {p.total_ordens}</Td>
                  <Td className="table-actions">
                    <div className="table-actions-row" style={{ flexWrap: 'wrap', minWidth: 0 }}>
                      <button type="button" className="btn btn-warning btn-xs" onClick={() => setBaixandoId(p.id)} title="Dar saída no estoque deste pedido">
                        <FontAwesomeIcon icon={faBoxOpen} /> Dar saída
                      </button>
                      <Link className="btn btn-default btn-xs" to={`/orcamentos/${p.id}`} title="Abrir orçamento">
                        Orçamento
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <EstoqueSaidaModal
        aberto={baixandoId !== null}
        orcamentoId={baixandoId}
        onFechar={() => setBaixandoId(null)}
        onConfirmado={() => void carregar()}
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
