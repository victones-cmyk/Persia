// apps/web/src/pages/OrcamentoDetalhe.tsx
// Visualização readonly de um orçamento + status + reenviar (se erro).

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faRotateRight, faSpinner, faFloppyDisk, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { formatBRL, formatNum } from '../lib/formatacao';
import { StatusBadge } from '../components/StatusBadge';
import { ClienteSearch } from '../components/ClienteSearch';
import { ConfirmModal } from '../components/ConfirmModal';
import type { OrcamentoDetalhe as Orc } from '../lib/orcamentoTypes';
import type { ClienteResumo } from '../lib/calcTypes';
import { TIPOS_PERSIANA, ACIONAMENTOS } from '../lib/calcTypes';

const tipoLabel = (v: string) => TIPOS_PERSIANA.find((t) => t.value === v)?.label ?? v.replace(/_/g, ' ');
const acionamentoLabel = (v: string | null) => (v ? ACIONAMENTOS.find((a) => a.value === v)?.label ?? v.replace(/_/g, ' ') : '—');

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
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [orc, setOrc] = useState<Orc | null>(null);
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [reenviando, setReenviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<{ orcamento: Orc }>(`/orcamentos/${id}`);
      setOrc(r.orcamento);
      setCliente(r.orcamento.gc_cliente_id ? { id: r.orcamento.gc_cliente_id, nome: r.orcamento.nome_cliente, tipo_pessoa: '', documento: null } : null);
    } catch {
      setOrc(null);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Editável (rascunho/erro): pode escolher cliente e salvar antes de enviar.
  const editavel = orc?.status === 'rascunho' || orc?.status === 'erro';

  async function salvar() {
    setSalvando(true);
    try {
      await api.put(`/orcamentos/${id}`, { gc_cliente_id: cliente?.id ?? null, nome_cliente: cliente?.nome ?? null });
      showToast('success', 'Orçamento salvo');
      carregar();
    } catch (e) {
      showToast('error', 'Falha ao salvar', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  async function reenviar() {
    setReenviando(true);
    try {
      // Garante que o cliente escolhido aqui esteja salvo antes de enviar.
      if (cliente?.id && cliente.id !== orc?.gc_cliente_id) {
        await api.put(`/orcamentos/${id}`, { gc_cliente_id: cliente.id, nome_cliente: cliente.nome });
      }
      await api.post(`/orcamentos/${id}/reenviar`);
      showToast('success', 'Orçamento enviado ao GestãoClick');
      carregar();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.data as { erro?: { message?: string } } | null)?.erro?.message ?? e.message : 'Falha';
      showToast('error', 'Falha ao enviar', msg);
      carregar();
    } finally {
      setReenviando(false);
    }
  }

  async function cancelar() {
    setCancelarAberto(false);
    try {
      await api.post(`/orcamentos/${id}/cancelar`);
      showToast('info', 'Orçamento cancelado');
      navigate('/orcamentos');
    } catch {
      showToast('error', 'Falha ao cancelar');
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
    <div>
      <Link to="/orcamentos" className="text-sm-ui text-neutral-600 inline-flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={faArrowLeft} /> Voltar para orçamentos
      </Link>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl-ui">{orc.nome_cliente}</h1>
            <div className="text-xs-ui text-neutral-500">
              Código GC: <span className="font-mono">{orc.gc_codigo ?? orc.gc_orcamento_id ?? '—'}</span>
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

        <Linha label="Produto" valor={tipoLabel(orc.tipo_produto)} />

        {/* Itens (janelas) do orçamento */}
        {orc.itens_json && orc.itens_json.length > 0 ? (
          <div className="mt-3 mb-1">
            <div className="text-xs-ui font-bold text-neutral-600 mb-2">
              {orc.itens_json.length} {orc.itens_json.length === 1 ? 'item' : 'itens'}
            </div>
            <div className="space-y-2">
              {orc.itens_json.map((it, i) => (
                <div key={i} className="bg-neutral-50 border border-neutral-300 rounded-sm p-3">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="text-sm-ui font-semibold text-neutral-800">{i + 1}. {it.tecido_nome}</span>
                    <span className="font-mono font-semibold tabular-nums whitespace-nowrap">{formatBRL(Number(it.valor_final))}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs-ui text-neutral-600">
                    <span>Medidas: {formatNum(Number(it.largura_m))} × {formatNum(Number(it.altura_m))} m</span>
                    <span>TC: {formatNum(Number(it.tc_m))} m</span>
                    <span>Acionamento: {acionamentoLabel(it.acionamento)}</span>
                    <span>Cor: {it.cor_acessorio || '—'}</span>
                    {it.rolamento && <span>Rolamento: {it.rolamento}</span>}
                    {it.base && <span>Base: {it.base}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <Linha label="Tecido" valor={orc.tecido_nome} />
            <Linha label="Medidas (L × A)" valor={`${formatNum(Number(orc.largura_m))} × ${formatNum(Number(orc.altura_m))} m`} />
            {orc.acionamento && <Linha label="Acionamento" valor={acionamentoLabel(orc.acionamento)} />}
            {orc.cor_acessorio && <Linha label="Cor acessório" valor={orc.cor_acessorio} />}
            {orc.rolamento && <Linha label="Rolamento" valor={orc.rolamento} />}
          </>
        )}

        <div className="flex justify-between py-3 mt-3" style={{ borderTop: '2px solid #ced4da' }}>
          <span className="font-bold">Valor total</span>
          <span className="font-mono font-bold text-xl-ui">{formatBRL(Number(orc.valor_final))}</span>
        </div>

        {/* Cliente — editável em rascunho/erro (escolher antes de enviar) */}
        {editavel && (
          <div className="mt-4">
            <label className="form-label">Cliente <span className="label-optional">(obrigatório para enviar ao GestãoClick)</span></label>
            <ClienteSearch selecionado={cliente} onSelecionar={setCliente} />
          </div>
        )}

        {orc.status !== 'cancelado' && (
          <div className="flex gap-2 mt-4">
            <button className="btn btn-danger" disabled={reenviando || salvando} onClick={() => setCancelarAberto(true)}>
              <FontAwesomeIcon icon={faXmark} /> Cancelar
            </button>
            {editavel && (
              <button className="btn btn-default flex-1" disabled={salvando || reenviando} onClick={salvar}>
                {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar</>}
              </button>
            )}
            {editavel && (
              <button className="btn btn-success flex-1" disabled={reenviando || salvando || !cliente} aria-disabled={reenviando || salvando || !cliente} onClick={reenviar}>
                {reenviando ? <FontAwesomeIcon icon={faSpinner} spin /> : (
                  <><FontAwesomeIcon icon={faRotateRight} /> {orc.status === 'rascunho' ? 'Enviar ao GestãoClick' : 'Reenviar ao GestãoClick'}</>
                )}
              </button>
            )}
          </div>
        )}
        {editavel && !cliente && (
          <div className="text-xs-ui text-neutral-500 mt-2">Selecione o cliente para habilitar o envio ao GestãoClick.</div>
        )}
      </div>

      <ConfirmModal
        aberto={cancelarAberto}
        titulo="Cancelar orçamento"
        mensagem="Deseja cancelar este orçamento? Isso afeta apenas a Pérsia — não altera nada no GestãoClick."
        confirmarLabel="Cancelar orçamento"
        cancelarLabel="Voltar"
        perigo
        onConfirmar={() => void cancelar()}
        onCancelar={() => setCancelarAberto(false)}
      />
    </div>
  );
}
