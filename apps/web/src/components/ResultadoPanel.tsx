// apps/web/src/components/ResultadoPanel.tsx
// Painel de resultado sticky (DS §10) — MULTI-ITENS: lista cada item (janela) com
// seu valor, soma o total do orçamento, aplica desconto + busca de cliente e envia
// ao GestãoClick (1 orçamento com N itens, Fase 5).

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import type { OrcamentoCalculado, ClienteResumo, OrcamentoSalvo } from '../lib/calcTypes';
import type { GcStatus } from '../hooks/useGcHealth';
import { formatBRL, formatNum, roundHalfUp } from '../lib/formatacao';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { ClienteSearch } from './ClienteSearch';
import { ModalSenhaGerente } from './ModalSenhaGerente';

function selectAll(e: React.MouseEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export function ResultadoPanel({
  dados,
  descontoMaxPct,
  gcStatus,
  gcUsuarioId,
  onEnviado,
}: {
  dados: OrcamentoCalculado;
  descontoMaxPct: number;
  gcStatus: GcStatus;
  gcUsuarioId: string | null;
  onEnviado: (orc: OrcamentoSalvo) => void;
}) {
  const { showToast } = useToast();
  const [desconto, setDesconto] = useState(0);
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const acimaLimite = desconto > descontoMaxPct;

  // Valor por item e totais (mesma regra do backend: desconto por item, RN-10).
  const linhas = dados.itens.map((it) => {
    const bruto = it.resultado.valor_bruto ?? 0;
    const final = roundHalfUp(bruto * (1 - desconto / 100));
    return { it, bruto, final };
  });
  const valorBruto = roundHalfUp(linhas.reduce((s, l) => s + l.bruto, 0));
  const valorFinal = roundHalfUp(linhas.reduce((s, l) => s + l.final, 0));

  const gcOffline = gcStatus !== 'online';
  const semVendedor = !gcUsuarioId;
  const podeEnviar = !gcOffline && !!cliente && !enviando;

  async function doSend(senhaGerente?: string): Promise<{ ok: boolean; senhaInvalida?: boolean }> {
    if (!cliente) return { ok: false };
    setEnviando(true);
    try {
      const r = await api.post<{ orcamento: OrcamentoSalvo }>('/orcamentos', {
        tipo: dados.tipo,
        itens: dados.itens.map((it) => it.input),
        desconto_pct: desconto,
        gc_cliente_id: cliente.id,
        nome_cliente: cliente.nome,
        ...(senhaGerente ? { senha_gerente: senhaGerente } : {}),
      });
      showToast('success', `Orçamento #${r.orcamento.gc_orcamento_id} criado no GestãoClick`, cliente.nome);
      onEnviado(r.orcamento);
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'SENHA_GERENTE_INVALIDA') return { ok: false, senhaInvalida: true };
        if (e.code === 'APROVACAO_NECESSARIA') {
          setModalAberto(true);
          return { ok: false };
        }
        const erro = (e.data as { erro?: { codigo?: string; message?: string } } | null)?.erro;
        if (erro?.codigo === 'GC_AUTH') {
          showToast('error', 'Credenciais GestãoClick inválidas', 'Contate o administrador.');
        } else {
          showToast('error', 'Erro ao enviar ao GestãoClick', erro?.message ?? e.message);
        }
        const orc = (e.data as { orcamento?: OrcamentoSalvo } | null)?.orcamento;
        if (orc) onEnviado(orc);
      } else {
        showToast('error', 'Falha inesperada ao enviar.');
      }
      return { ok: false };
    } finally {
      setEnviando(false);
    }
  }

  function onClickEnviar() {
    if (!podeEnviar) return;
    if (acimaLimite) setModalAberto(true);
    else void doSend();
  }

  return (
    <div className="card sticky p-4 max-w-form" style={{ top: 'calc(50px + 16px)' }}>
      <h4 className="text-lg-ui font-medium mb-3">Resultado</h4>

      {/* Itens do orçamento */}
      <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3 max-h-72 overflow-y-auto">
        {linhas.map(({ it, bruto, final }, i) => (
          <div key={i} className="py-2 border-b border-neutral-200 last:border-b-0">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs-ui font-semibold text-neutral-800 pr-1">
                {i + 1}. {it.tecido.nome}
              </span>
              <span className="font-mono font-semibold tabular-nums text-sm-ui whitespace-nowrap">
                {formatBRL(desconto > 0 ? final : bruto)}
              </span>
            </div>
            <div className="flex justify-between text-2xs-ui text-neutral-500 mt-0.5">
              <span>{formatNum(it.resultado.largura)} × {formatNum(it.resultado.altura)} m · {formatNum(it.resultado.qtd_venda)} m²</span>
              <span>TC {formatNum(it.resultado.tc)} m</span>
            </div>
          </div>
        ))}
      </div>

      <label className="form-label" htmlFor="valor-bruto">Valor Bruto ({linhas.length} {linhas.length === 1 ? 'item' : 'itens'})</label>
      <input id="valor-bruto" className="input input-mono mb-3" value={formatBRL(valorBruto)} readOnly tabIndex={-1} onClick={selectAll} />

      {/* Desconto */}
      <div className={acimaLimite ? 'rounded-sm p-3 mb-3' : 'mb-3'} style={acimaLimite ? { border: '2px dashed var(--action-edit)', background: 'var(--color-warning-subtle)' } : undefined}>
        <label className="form-label" htmlFor="desconto">
          Desconto (%) <span className="label-optional">(limite {formatNum(descontoMaxPct, 0)}%)</span>
        </label>
        <input id="desconto" type="number" className="input" min={0} max={100} step={1} value={desconto}
          onChange={(e) => setDesconto(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        {acimaLimite && <div className="helper-error mt-1">Acima do limite. Exigirá senha de gerente.</div>}
      </div>

      <label className="form-label" htmlFor="valor-final">Valor Final</label>
      <input id="valor-final" className="input input-mono mb-4"
        style={{ color: desconto === 0 ? 'var(--color-success)' : 'var(--neutral-800)', fontSize: 20 }}
        value={formatBRL(valorFinal)} readOnly tabIndex={-1} onClick={selectAll} />

      {/* Cliente */}
      <label className="form-label">Cliente <span className="label-required">*</span></label>
      <div className="mb-3">
        <ClienteSearch selecionado={cliente} onSelecionar={setCliente} />
      </div>

      {gcOffline && <div className="alert alert-warning mb-3 text-xs-ui"><span>GestãoClick indisponível. Envio bloqueado.</span></div>}
      {semVendedor && <div className="alert alert-warning mb-3 text-xs-ui"><span>Seu usuário não está vinculado a um vendedor do GestãoClick — o orçamento será enviado sem vendedor. Um admin pode vincular em Administração → Usuários.</span></div>}

      <button type="button" className="btn btn-success w-full" disabled={!podeEnviar} aria-disabled={!podeEnviar} onClick={onClickEnviar}>
        {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faPaperPlane} /> Enviar ao GestãoClick</>}
      </button>

      <ModalSenhaGerente
        aberto={modalAberto}
        descontoPct={desconto}
        onCancelar={() => setModalAberto(false)}
        onConfirmar={async (senha) => {
          const r = await doSend(senha);
          if (r.ok) setModalAberto(false);
          return r.ok;
        }}
      />
    </div>
  );
}
