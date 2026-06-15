// apps/web/src/components/CortinaResultado.tsx
// Resultado da calculadora de CORTINA: metragem de tecido + lista de itens
// (quantidades). Preços dos acessórios vêm do GestãoClick; o envio do orçamento
// de cortina será habilitado quando o mapeamento de acessórios estiver pronto.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import type { CalcularCortinaResposta } from '../lib/cortinaTypes';
import { formatBRL, formatNum } from '../lib/formatacao';

export function CortinaResultado({ dados }: { dados: CalcularCortinaResposta }) {
  const { resultado, tecido_frente, tecido_tras, valor_tecido } = dados;
  const tecidos = resultado.itens.filter((i) => i.tipo === 'tecido');
  const acessorios = resultado.itens.filter((i) => i.tipo === 'acessorio');

  return (
    <div className="card sticky p-4 max-w-form" style={{ top: 'calc(50px + 16px)' }}>
      <h4 className="text-lg-ui font-medium mb-3">Resultado</h4>

      {/* Método + tecido */}
      <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="badge badge-secondary">
            {resultado.metodo === 'emenda' ? `Emenda — ${resultado.tiras_frente} tiras` : 'Método normal'}
          </span>
          <span className="text-2xs-ui text-neutral-500">barra {formatNum(resultado.barra_consumo)} m</span>
        </div>
        <div className="text-sm-ui font-semibold text-neutral-800">{tecido_frente.nome}</div>
        <div className="flex justify-between mt-1 text-xs-ui text-neutral-500">
          <span>Frente: {formatNum(resultado.metragem_frente)} m × {formatBRL(tecido_frente.preco_venda)}</span>
          <span>rolo {formatNum(tecido_frente.dimensao_m)} m</span>
        </div>
        {resultado.metragem_tras !== null && tecido_tras && (
          <div className="flex justify-between mt-1 text-xs-ui text-neutral-500">
            <span>Trás/forro: {formatNum(resultado.metragem_tras)} m × {formatBRL(tecido_tras.preco_venda)}</span>
            <span>rolo {formatNum(tecido_tras.dimensao_m)} m</span>
          </div>
        )}
      </div>

      {/* Itens / acessórios (quantidades) */}
      <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3 max-h-64 overflow-y-auto">
        <div className="text-xs-ui font-bold text-neutral-600 mb-1">Itens</div>
        {[...tecidos, ...acessorios].map((it, i) => (
          <div key={i} className="flex justify-between py-0.5 text-xs-ui border-b border-neutral-200">
            <span className="text-neutral-600 pr-2">
              {it.item}{!it.auto && <span className="text-neutral-400"> (definir)</span>}
            </span>
            <span className="font-mono tabular-nums text-neutral-800 whitespace-nowrap">
              {formatNum(it.quantidade, it.unidade === 'un' ? 0 : 2)} {it.unidade}
            </span>
          </div>
        ))}
      </div>

      <label className="form-label">Valor do tecido (SOB MEDIDA)</label>
      <input className="input input-mono mb-3" value={formatBRL(valor_tecido)} readOnly tabIndex={-1} onClick={(e) => e.currentTarget.select()} />

      <div className="alert alert-info text-xs-ui">
        <FontAwesomeIcon icon={faCircleInfo} />
        <span>
          Os acessórios saem do GestãoClick (o vendedor seleciona). O envio do orçamento de
          cortina será habilitado em seguida — por ora, esta é a calculadora.
        </span>
      </div>
    </div>
  );
}
