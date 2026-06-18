// apps/web/src/components/ResultadoPanel.tsx
// Painel de resultado sticky (DS §10) — MULTI-ITENS: lista cada item (janela) com
// seu valor, soma o total do orçamento e envia ao GestãoClick (1 orçamento com N
// itens, Fase 5). SEM desconto: o vendedor envia o valor cheio e o desconto é
// decidido no próprio GestãoClick (Victor 17/06/2026).

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPaperPlane, faFloppyDisk } from '@fortawesome/free-solid-svg-icons';
import type { OrcamentoCalculado, ClienteResumo, OrcamentoSalvo } from '../lib/calcTypes';
import type { GcStatus } from '../hooks/useGcHealth';
import { formatBRL, formatNum, roundHalfUp } from '../lib/formatacao';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { ConfirmModal } from './ConfirmModal';

function selectAll(e: React.MouseEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export function ResultadoPanel({
  dados,
  cliente,
  gcStatus,
  gcUsuarioId,
  editarId,
  onEnviado,
}: {
  dados: OrcamentoCalculado | null;
  cliente: ClienteResumo | null;
  gcStatus: GcStatus;
  gcUsuarioId: string | null;
  editarId?: string | null;
  onEnviado: (orc: OrcamentoSalvo) => void;
}) {
  const { showToast } = useToast();
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [enviarAberto, setEnviarAberto] = useState(false);

  // Valor por item e total do orçamento (RN-10). dados null = orçamento ainda vazio.
  const linhas = dados ? dados.itens.map((it) => ({ it, valor: it.resultado.valor_bruto ?? 0 })) : [];
  const valorTotal = roundHalfUp(linhas.reduce((s, l) => s + l.valor, 0));
  const temItens = linhas.length > 0;
  const incompleto = !!dados?.incompleto; // há item com campos obrigatórios em branco

  const gcOffline = gcStatus !== 'online';
  const semVendedor = !gcUsuarioId;
  const ocupado = enviando || salvando;
  const podeEnviar = !gcOffline && !!cliente && temItens && !incompleto && !ocupado;
  const podeSalvar = temItens && !incompleto && !ocupado;

  /** apenasSalvar=true grava rascunho local (cliente opcional, sem enviar ao GC). */
  async function doSubmit(apenasSalvar: boolean): Promise<{ ok: boolean }> {
    if (!dados || !temItens) return { ok: false };
    if (!apenasSalvar && !cliente) return { ok: false };
    if (apenasSalvar) setSalvando(true);
    else setEnviando(true);
    try {
      const r = await api.post<{ orcamento: OrcamentoSalvo }>('/orcamentos', {
        tipo: dados.tipo,
        itens: dados.itens.map((it) => it.input),
        ...(cliente ? { gc_cliente_id: cliente.id, nome_cliente: cliente.nome } : {}),
        ...(apenasSalvar ? { apenas_salvar: true } : {}),
        ...(editarId ? { editar_id: editarId } : {}),
      });
      showToast(
        'success',
        apenasSalvar ? 'Orçamento salvo (rascunho)' : `Orçamento #${r.orcamento.gc_orcamento_id} criado no GestãoClick`,
        cliente?.nome,
      );
      onEnviado(r.orcamento);
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError) {
        const erro = (e.data as { erro?: { codigo?: string; message?: string } } | null)?.erro;
        if (erro?.codigo === 'GC_AUTH') {
          showToast('error', 'Credenciais GestãoClick inválidas', 'Contate o administrador.');
        } else {
          showToast('error', apenasSalvar ? 'Erro ao salvar' : 'Erro ao enviar ao GestãoClick', erro?.message ?? e.message);
        }
        const orc = (e.data as { orcamento?: OrcamentoSalvo } | null)?.orcamento;
        if (orc) onEnviado(orc);
      } else {
        showToast('error', 'Falha inesperada.');
      }
      return { ok: false };
    } finally {
      if (apenasSalvar) setSalvando(false);
      else setEnviando(false);
    }
  }

  function onClickEnviar() {
    if (!podeEnviar) return;
    setEnviarAberto(true);
  }

  return (
    <div className="card sticky p-4" style={{ top: 'calc(50px + 16px)' }}>
      <h4 className="text-lg-ui font-medium mb-3">Orçamento</h4>

      {/* Itens do orçamento */}
      <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3 max-h-72 overflow-y-auto">
        {temItens ? linhas.map(({ it, valor }, i) => (
          <div key={i} className="py-2 border-b border-neutral-200 last:border-b-0">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs-ui font-semibold text-neutral-800 pr-1">
                {i + 1}. {it.tecido.nome}
              </span>
              <span className="font-mono font-semibold tabular-nums text-sm-ui whitespace-nowrap">
                {formatBRL(valor)}
              </span>
            </div>
            <div className="flex justify-between text-2xs-ui text-neutral-500 mt-0.5">
              <span>{formatNum(it.resultado.largura)} × {formatNum(it.resultado.altura)} m · {formatNum(it.resultado.qtd_venda)} m²</span>
              <span>TC {formatNum(it.resultado.tc)} m</span>
            </div>
          </div>
        )) : (
          <div className="text-xs-ui text-neutral-500 py-2">Preencha os dados ao lado — o orçamento é calculado automaticamente.</div>
        )}
      </div>

      <label className="form-label" htmlFor="valor-total">Valor total ({linhas.length} {linhas.length === 1 ? 'item' : 'itens'})</label>
      <input id="valor-total" className="input input-mono mb-4"
        style={{ color: 'var(--color-success)', fontSize: 20 }}
        value={formatBRL(valorTotal)} readOnly tabIndex={-1} onClick={selectAll} />

      {incompleto && <div className="alert alert-warning mb-3 text-xs-ui"><span>Há item com <strong>campos obrigatórios</strong> não preenchidos. Complete ou remova o item para enviar/salvar.</span></div>}
      {temItens && !incompleto && !cliente && <div className="alert alert-info mb-3 text-xs-ui"><span>Selecione o <strong>cliente</strong> no topo para enviar ao GestãoClick (ou use <strong>Salvar</strong>).</span></div>}
      {temItens && gcOffline && <div className="alert alert-warning mb-3 text-xs-ui"><span>GestãoClick indisponível. Você ainda pode <strong>Salvar</strong> o orçamento.</span></div>}
      {temItens && !gcOffline && semVendedor && <div className="alert alert-warning mb-3 text-xs-ui"><span>Seu usuário não está vinculado a um vendedor do GestãoClick — o orçamento sairá sem vendedor. Um admin pode vincular em Administração → Usuários.</span></div>}

      <div className="flex gap-2">
        <button type="button" className="btn btn-default flex-1" disabled={!podeSalvar} aria-disabled={!podeSalvar} onClick={() => setSalvarAberto(true)} title="Salva o orçamento sem enviar ao GestãoClick">
          {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar</>}
        </button>
        <button type="button" className="btn btn-success flex-1" disabled={!podeEnviar} aria-disabled={!podeEnviar} onClick={onClickEnviar}>
          {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faPaperPlane} /> Enviar</>}
        </button>
      </div>

      <ConfirmModal
        aberto={salvarAberto}
        titulo="Salvar orçamento"
        mensagem="Deseja salvar este orçamento como rascunho na Pérsia? Ele não será enviado ao GestãoClick agora."
        confirmarLabel="Salvar"
        cancelarLabel="Voltar"
        onConfirmar={() => { setSalvarAberto(false); void doSubmit(true); }}
        onCancelar={() => setSalvarAberto(false)}
      />

      <ConfirmModal
        aberto={enviarAberto}
        titulo="Enviar ao GestãoClick"
        mensagem={<>Deseja enviar este orçamento de <strong>{formatBRL(valorTotal)}</strong> para o GestãoClick{cliente ? <> (cliente <strong>{cliente.nome}</strong>)</> : null}?</>}
        confirmarLabel="Enviar"
        cancelarLabel="Voltar"
        onConfirmar={() => { setEnviarAberto(false); void doSubmit(false); }}
        onCancelar={() => setEnviarAberto(false)}
      />
    </div>
  );
}
