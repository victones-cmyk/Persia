// apps/web/src/pages/OrcamentoDetalhe.tsx
// Visualização readonly de um orçamento + status + reenviar (se erro).

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faRotateRight, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { formatBRL, formatNum } from '../lib/formatacao';
import { StatusBadge } from '../components/StatusBadge';
import type { OrcamentoDetalhe as Orc } from '../lib/orcamentoTypes';

function Linha({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-neutral-200 text-md-ui">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-800 font-medium text-right">{valor}</span>
    </div>
  );
}

export function OrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [orc, setOrc] = useState<Orc | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [reenviando, setReenviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<{ orcamento: Orc }>(`/orcamentos/${id}`);
      setOrc(r.orcamento);
    } catch {
      setOrc(null);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function reenviar() {
    setReenviando(true);
    try {
      await api.post(`/orcamentos/${id}/reenviar`);
      showToast('success', 'Orçamento reenviado ao GestãoClick');
      carregar();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.data as { erro?: { message?: string } } | null)?.erro?.message ?? e.message : 'Falha';
      showToast('error', 'Falha ao reenviar', msg);
      carregar();
    } finally {
      setReenviando(false);
    }
  }

  if (carregando) {
    return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando…</div>;
  }
  if (!orc) {
    return (
      <div>
        <Link to="/orcamentos" className="text-sm-ui text-neutral-600">← Voltar</Link>
        <div className="alert alert-error mt-4 max-w-form"><span>Orçamento não encontrado.</span></div>
      </div>
    );
  }

  return (
    <div className="max-w-form">
      <Link to="/orcamentos" className="text-sm-ui text-neutral-600 inline-flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={faArrowLeft} /> Voltar para orçamentos
      </Link>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl-ui">{orc.nome_cliente}</h1>
            <div className="text-xs-ui text-neutral-500">
              Código GC: <span className="font-mono">{orc.gc_orcamento_id ?? '—'}</span>
            </div>
          </div>
          <StatusBadge status={orc.status} />
        </div>

        {orc.status === 'erro' && (
          <div className="alert alert-error mb-4">
            <div>
              <div className="font-semibold">Falha no envio ao GestãoClick</div>
              <div className="text-xs-ui opacity-85">{orc.erro_gc}</div>
            </div>
          </div>
        )}

        <Linha label="Produto" valor={orc.tipo_produto.replace('persiana_', '').replace(/_/g, ' ')} />
        <Linha label="Tecido" valor={orc.tecido_nome} />
        <Linha label="Medidas (L × A)" valor={`${formatNum(Number(orc.largura_m))} × ${formatNum(Number(orc.altura_m))} m`} />
        {orc.dimensao_m && <Linha label="Dimensão do rolo" valor={`${formatNum(Number(orc.dimensao_m))} m`} />}
        {orc.tc_m && <Linha label="TC" valor={`${formatNum(Number(orc.tc_m))} m`} />}
        {orc.acionamento && <Linha label="Acionamento" valor={orc.acionamento.replace(/_/g, ' ')} />}
        {orc.cor_acessorio && <Linha label="Cor acessório" valor={orc.cor_acessorio} />}
        {orc.rolamento && <Linha label="Rolamento" valor={orc.rolamento} />}
        <Linha label="Valor bruto" valor={<span className="font-mono">{formatBRL(Number(orc.valor_bruto))}</span>} />
        <Linha label="Desconto" valor={`${formatNum(Number(orc.desconto_pct), 0)}%`} />
        <div className="flex justify-between py-3 mt-1" style={{ borderTop: '2px solid #ced4da' }}>
          <span className="font-bold">Valor final</span>
          <span className="font-mono font-bold text-xl-ui">{formatBRL(Number(orc.valor_final))}</span>
        </div>

        {/* Breakdown de itens (snapshot) */}
        {orc.itens?.length > 0 && (
          <div className="mt-4">
            <div className="text-xs-ui font-bold text-neutral-600 mb-1">Itens (snapshot)</div>
            <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 max-h-64 overflow-y-auto">
              {orc.itens.map((it) => (
                <div key={it.id} className="flex justify-between py-0.5 text-xs-ui border-b border-neutral-200">
                  <span className="text-neutral-600 pr-2">{it.descricao}</span>
                  <span className="font-mono tabular-nums text-neutral-800 whitespace-nowrap">
                    {formatNum(Number(it.quantidade), it.unidade === 'un' ? 0 : 2)} {it.unidade}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {orc.status === 'erro' && (
          <button className="btn btn-warning w-full mt-4" disabled={reenviando} onClick={reenviar}>
            {reenviando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faRotateRight} /> Reenviar ao GestãoClick</>}
          </button>
        )}
      </div>
    </div>
  );
}
