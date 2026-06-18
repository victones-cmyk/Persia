// apps/web/src/pages/OrcamentoDetalhe.tsx
// Visualização readonly de um orçamento + status + reenviar (se erro).

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faRotateRight, faSpinner, faFloppyDisk, faXmark, faPen } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { formatBRL, formatNum } from '../lib/formatacao';
import { StatusBadge } from '../components/StatusBadge';
import { ClienteSearch } from '../components/ClienteSearch';
import { ConfirmModal } from '../components/ConfirmModal';
import type { OrcamentoDetalhe as Orc } from '../lib/orcamentoTypes';
import type { ClienteResumo } from '../lib/calcTypes';
import { TIPOS_PERSIANA, ACIONAMENTOS } from '../lib/calcTypes';
import { MODELOS_CORTINA, FIXACOES_CORTINA } from '../lib/cortinaTypes';

// Snapshot de uma cortina salvo em itens_json (estrutura do servidor).
interface CortinaCamadaSnap { tecido_nome: string; metragem: number; valor_tecido: number }
interface CortinaAcessorioSnap { item: string; produto_nome?: string; quantidade: number; preco: number; subtotal: number }
interface CortinaSnap {
  ambiente?: string; modelo: string; fixacao: string; largura: number; altura: number;
  n_camadas: number; camadas: CortinaCamadaSnap[]; acessorios: CortinaAcessorioSnap[];
  valor_total: number; nome_produto?: string;
}

const modeloLabel = (v: string) => MODELOS_CORTINA.find((m) => m.value === v)?.label ?? v;
const fixacaoLabel = (v: string) => FIXACOES_CORTINA.find((f) => f.value === v)?.label ?? v;

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

/** Detalhe de UMA cortina: modelo/fixação/medidas + camadas (tecidos) + acessórios. */
function CortinaItem({ c, indice }: { c: CortinaSnap; indice: number }) {
  return (
    <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3">
      <div className="flex justify-between items-start gap-2 mb-1">
        <span className="text-sm-ui font-semibold text-neutral-800">
          {indice + 1}. {c.ambiente?.trim() || c.nome_produto || `Cortina ${indice + 1}`}
        </span>
        <span className="font-mono font-semibold tabular-nums whitespace-nowrap">{formatBRL(Number(c.valor_total))}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs-ui text-neutral-600 mb-2">
        <span>Modelo: {modeloLabel(c.modelo)}</span>
        <span>Fixação: {fixacaoLabel(c.fixacao)}</span>
        <span>Medidas: {formatNum(Number(c.largura))} × {formatNum(Number(c.altura))} m</span>
        <span>Camadas: {c.n_camadas}</span>
      </div>

      {c.camadas?.length > 0 && (
        <div className="mb-2">
          <div className="text-2xs-ui font-bold uppercase text-neutral-500 mb-0.5">Tecidos</div>
          {c.camadas.map((cam, j) => (
            <div key={j} className="flex justify-between text-xs-ui text-neutral-700">
              <span>{j === 0 ? 'Frente' : `Camada ${j + 1}`}: {cam.tecido_nome} — {formatNum(Number(cam.metragem))} m</span>
              <span className="font-mono tabular-nums">{formatBRL(Number(cam.valor_tecido))}</span>
            </div>
          ))}
        </div>
      )}

      {c.acessorios?.length > 0 && (
        <div>
          <div className="text-2xs-ui font-bold uppercase text-neutral-500 mb-0.5">Acessórios</div>
          {c.acessorios.map((a, j) => (
            <div key={j} className="flex justify-between text-xs-ui text-neutral-700">
              <span>{a.produto_nome || a.item} · {formatNum(Number(a.quantidade), Number.isInteger(Number(a.quantidade)) ? 0 : 2)} un</span>
              <span className="font-mono tabular-nums">{formatBRL(Number(a.subtotal))}</span>
            </div>
          ))}
        </div>
      )}
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
  const [enviarAberto, setEnviarAberto] = useState(false);

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

  // Rascunho: edita reabrindo a calculadora inteira (botão Editar → /orcamentos/novo?editar=).
  // Erro: edição inline (escolher cliente + reenviar) para retentativa.
  const eRascunho = orc?.status === 'rascunho';
  const emEdicao = orc?.status === 'erro';

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

  // Cortina guarda { cortinas:[...], instalacao } em itens_json (não é array de itens).
  const ehCortina = orc.tipo_produto === 'cortina';
  const cortinaJson = ehCortina ? (orc.itens_json as unknown as { cortinas?: CortinaSnap[]; instalacao?: number } | null) : null;
  const cortinaSnaps = cortinaJson?.cortinas ?? [];
  const instalacaoVal = Number(cortinaJson?.instalacao ?? 0);
  const persianaItens = !ehCortina && Array.isArray(orc.itens_json) ? orc.itens_json : [];

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
              Nº GestãoClick: <span className="font-mono">{orc.gc_codigo ?? orc.gc_orcamento_id ?? '—'}</span>
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

        {/* Itens do orçamento */}
        {ehCortina && cortinaSnaps.length > 0 ? (
          <div className="mt-3 mb-1">
            <div className="text-xs-ui font-bold text-neutral-600 mb-2">
              {cortinaSnaps.length} {cortinaSnaps.length === 1 ? 'cortina' : 'cortinas'}
            </div>
            <div className="space-y-2">
              {cortinaSnaps.map((c, i) => <CortinaItem key={i} c={c} indice={i} />)}
              {instalacaoVal > 0 && (
                <div className="flex justify-between items-center bg-neutral-50 border border-neutral-300 rounded-sm p-3">
                  <span className="text-sm-ui font-semibold text-neutral-800">Instalação</span>
                  <span className="font-mono font-semibold tabular-nums">{formatBRL(instalacaoVal)}</span>
                </div>
              )}
            </div>
          </div>
        ) : persianaItens.length > 0 ? (
          <div className="mt-3 mb-1">
            <div className="text-xs-ui font-bold text-neutral-600 mb-2">
              {persianaItens.length} {persianaItens.length === 1 ? 'item' : 'itens'}
            </div>
            <div className="space-y-2">
              {persianaItens.map((it, i) => (
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

        {/* Cliente — erro: seletor (retentativa); demais: exibe o cliente atual */}
        {emEdicao ? (
          <div className="mt-4">
            <label className="form-label">Cliente <span className="label-optional">(obrigatório para enviar ao GestãoClick)</span></label>
            <ClienteSearch selecionado={cliente} onSelecionar={setCliente} />
          </div>
        ) : eRascunho ? (
          <Linha label="Cliente" valor={orc.nome_cliente || '—'} />
        ) : null}

        {orc.status !== 'cancelado' && (
          <div className="flex gap-2 mt-4">
            <button className="btn btn-danger" disabled={reenviando || salvando} onClick={() => setCancelarAberto(true)}>
              <FontAwesomeIcon icon={faXmark} /> Cancelar orçamento
            </button>
            {eRascunho && (
              <button className="btn btn-warning flex-1" onClick={() => navigate(`/orcamentos/novo?editar=${orc.id}`)}>
                <FontAwesomeIcon icon={faPen} /> Editar
              </button>
            )}
            {emEdicao && (
              <button className="btn btn-default flex-1" disabled={salvando || reenviando} onClick={salvar}>
                {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar</>}
              </button>
            )}
            {emEdicao && (
              <button className="btn btn-success flex-1" disabled={reenviando || salvando || !cliente} aria-disabled={reenviando || salvando || !cliente} onClick={() => { if (cliente) setEnviarAberto(true); }}>
                {reenviando ? <FontAwesomeIcon icon={faSpinner} spin /> : (
                  <><FontAwesomeIcon icon={faRotateRight} /> Reenviar ao GestãoClick</>
                )}
              </button>
            )}
          </div>
        )}
        {emEdicao && !cliente && (
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

      <ConfirmModal
        aberto={enviarAberto}
        titulo="Reenviar ao GestãoClick"
        mensagem={<>Deseja reenviar este orçamento de <strong>{formatBRL(Number(orc.valor_final))}</strong> para o GestãoClick{cliente ? <> (cliente <strong>{cliente.nome}</strong>)</> : null}?</>}
        confirmarLabel="Reenviar"
        cancelarLabel="Voltar"
        onConfirmar={() => { setEnviarAberto(false); void reenviar(); }}
        onCancelar={() => setEnviarAberto(false)}
      />
    </div>
  );
}
