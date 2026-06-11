// apps/web/src/components/ResultadoPanel.tsx
// Painel de resultado sticky (DS §10): breakdown readonly + valor bruto + desconto
// + busca de cliente + envio ao GestãoClick (Fase 5).

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import type { CalcularResposta, PersianaInputs, ClienteResumo, OrcamentoSalvo } from '../lib/calcTypes';
import type { GcStatus } from '../hooks/useGcHealth';
import { formatBRL, formatNum, roundHalfUp } from '../lib/formatacao';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { ClienteSearch } from './ClienteSearch';

const GRUPO_LABEL: Record<string, string> = {
  fixo: 'Fixos',
  condicional: 'Condicionais',
  base: 'Base / Tampa',
};

function selectAll(e: React.MouseEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export function ResultadoPanel({
  dados,
  inputs,
  descontoMaxPct,
  gcStatus,
  gcUsuarioId,
  onEnviado,
}: {
  dados: CalcularResposta;
  inputs: PersianaInputs;
  descontoMaxPct: number;
  gcStatus: GcStatus;
  gcUsuarioId: string | null;
  onEnviado: (orc: OrcamentoSalvo) => void;
}) {
  const { resultado, tecido } = dados;
  const { showToast } = useToast();
  const [desconto, setDesconto] = useState(0);
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [enviando, setEnviando] = useState(false);

  const valorBruto = resultado.valor_bruto ?? 0;
  const acimaLimite = desconto > descontoMaxPct;
  const valorFinal = roundHalfUp(valorBruto * (1 - desconto / 100));

  const grupos = ['fixo', 'condicional', 'base'] as const;

  const gcOffline = gcStatus !== 'online';
  const semUsuarioGc = !gcUsuarioId;
  const podeEnviar = !gcOffline && !semUsuarioGc && !!cliente && !acimaLimite && !enviando;

  async function enviar() {
    if (!podeEnviar || !cliente) return;
    setEnviando(true);
    try {
      const r = await api.post<{ orcamento: OrcamentoSalvo }>('/orcamentos', {
        ...inputs,
        desconto_pct: desconto,
        gc_cliente_id: cliente.id,
        nome_cliente: cliente.nome,
      });
      showToast('success', `Orçamento #${r.orcamento.gc_orcamento_id} criado no GestãoClick`, cliente.nome);
      onEnviado(r.orcamento);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'APROVACAO_NECESSARIA') {
          showToast('warning', 'Desconto acima do limite', 'Necessária aprovação do gerente (Fase 6).');
        } else {
          const erro = (e.data as { erro?: { codigo?: string; message?: string } } | null)?.erro;
          if (erro?.codigo === 'GC_AUTH') {
            showToast('error', 'Credenciais GestãoClick inválidas', 'Contate o administrador.');
          } else {
            showToast('error', 'Erro ao enviar ao GestãoClick', erro?.message ?? e.message);
          }
          // 502: orçamento foi salvo como "erro" → leva para a listagem (reenvio).
          const orc = (e.data as { orcamento?: OrcamentoSalvo } | null)?.orcamento;
          if (orc) onEnviado(orc);
        }
      } else {
        showToast('error', 'Falha inesperada ao enviar.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card sticky p-4" style={{ top: 'calc(50px + 16px)' }}>
      <h4 className="text-lg-ui font-medium mb-3">Resultado</h4>

      {/* Tecido (linha que define o preço — RN-03) */}
      <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3">
        <div className="text-xs-ui text-neutral-500">Tecido</div>
        <div className="text-sm-ui font-semibold text-neutral-800">{tecido.nome}</div>
        <div className="flex justify-between mt-2 text-sm-ui">
          <span className="text-neutral-500">
            {formatNum(resultado.qtd_venda)} m² × {formatBRL(tecido.preco_venda)}
          </span>
          <span className="font-mono font-semibold tabular-nums">{formatBRL(valorBruto)}</span>
        </div>
        <div className="flex justify-between mt-1 text-xs-ui text-neutral-500">
          <span>Produção: {formatNum(resultado.qtd_producao)} m²</span>
          <span>TC: {formatNum(resultado.tc)} m</span>
        </div>
      </div>

      {/* Breakdown de componentes (lista técnica / OS) — readonly */}
      <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3 max-h-56 overflow-y-auto">
        <div className="text-xs-ui font-bold text-neutral-600 mb-1">Componentes (produção)</div>
        {grupos.map((g) => {
          const itens = resultado.componentes.filter((c) => c.grupo === g);
          if (itens.length === 0) return null;
          return (
            <div key={g} className="mb-2">
              <div className="text-2xs-ui uppercase text-neutral-500 mt-1">{GRUPO_LABEL[g]}</div>
              {itens.map((c, i) => (
                <div key={`${g}-${i}`} className="flex justify-between py-0.5 text-xs-ui border-b border-neutral-200">
                  <span className="text-neutral-600 pr-2">{c.descricao}</span>
                  <span className="font-mono tabular-nums text-neutral-800 whitespace-nowrap">
                    {formatNum(c.quantidade, c.unidade === 'un' ? 0 : 2)} {c.unidade}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <label className="form-label" htmlFor="valor-bruto">Valor Bruto</label>
      <input id="valor-bruto" className="input input-mono mb-3" value={formatBRL(valorBruto)} readOnly tabIndex={-1} onClick={selectAll} />

      {/* Desconto */}
      <div className={acimaLimite ? 'rounded-sm p-3 mb-3' : 'mb-3'} style={acimaLimite ? { border: '2px dashed var(--action-edit)', background: 'var(--color-warning-subtle)' } : undefined}>
        <label className="form-label" htmlFor="desconto">
          Desconto (%) <span className="label-optional">(limite {formatNum(descontoMaxPct, 0)}%)</span>
        </label>
        <input id="desconto" type="number" className="input" min={0} max={100} step={1} value={desconto}
          onChange={(e) => setDesconto(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        {acimaLimite && <div className="helper-error mt-1">Acima do limite. Exigirá senha de gerente (Fase 6).</div>}
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

      {/* Avisos de bloqueio de envio */}
      {gcOffline && <div className="alert alert-warning mb-3 text-xs-ui"><span>GestãoClick indisponível. Envio bloqueado.</span></div>}
      {semUsuarioGc && <div className="alert alert-error mb-3 text-xs-ui"><span>Seu usuário não está vinculado ao GestãoClick. Peça a um admin para vincular antes de enviar.</span></div>}

      <button type="button" className="btn btn-success w-full" disabled={!podeEnviar} aria-disabled={!podeEnviar} onClick={enviar}>
        {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faPaperPlane} /> Enviar ao GestãoClick</>}
      </button>
    </div>
  );
}
