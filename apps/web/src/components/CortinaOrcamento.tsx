// apps/web/src/components/CortinaOrcamento.tsx
// Orçamento de CORTINA (modelo "+" do Victor): N cortinas (ambientes), cada uma com
// camadas e seletores de acessório (CortinaCard). Soma o total (tecidos + acessórios
// + instalação). O envio ao GestãoClick é a próxima etapa.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSpinner, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { CortinaCard, type CortinaResumo } from './CortinaCard';
import { formatBRL } from '../lib/formatacao';
import type { TecidoOpcao } from '../lib/calcTypes';
import type { AcessoriosCortinaResp } from '../lib/cortinaTypes';

export function CortinaOrcamento() {
  const [tecidos, setTecidos] = useState<TecidoOpcao[]>([]);
  const [opcoes, setOpcoes] = useState<AcessoriosCortinaResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);

  const [ids, setIds] = useState<string[]>([crypto.randomUUID()]);
  const [resumos, setResumos] = useState<Record<string, CortinaResumo>>({});
  const [instalacao, setInstalacao] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ tecidos: TecidoOpcao[] }>('/calcular/cortina/tecidos'),
      api.get<AcessoriosCortinaResp>('/calcular/cortina/acessorios'),
    ])
      .then(([t, o]) => { setTecidos(t.tecidos); setOpcoes(o); })
      .catch(() => setErroCarga(true))
      .finally(() => setCarregando(false));
  }, []);

  const setResumo = (id: string, r: CortinaResumo) => setResumos((m) => ({ ...m, [id]: r }));
  const removerCortina = (id: string) => {
    setIds((xs) => xs.filter((x) => x !== id));
    setResumos((m) => { const n = { ...m }; delete n[id]; return n; });
  };

  const totalCortinas = ids.reduce((s, id) => s + (resumos[id]?.total ?? 0), 0);
  const valorInstalacao = Math.max(0, Number(instalacao) || 0);
  const totalGeral = Math.round((totalCortinas + valorInstalacao) * 100) / 100;

  if (carregando) {
    return <div className="card p-6 text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando tecidos e acessórios…</div>;
  }
  if (erroCarga || !opcoes) {
    return <div className="alert alert-error max-w-form"><span>Não foi possível carregar os dados do GestãoClick. Tente recarregar.</span></div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Coluna esquerda: cortinas */}
      <div className="lg:col-span-2 space-y-4">
        {ids.map((id, i) => (
          <CortinaCard
            key={id}
            indice={i}
            tecidos={tecidos}
            opcoes={opcoes}
            onChange={(r) => setResumo(id, r)}
            onRemover={() => removerCortina(id)}
            podeRemover={ids.length > 1}
          />
        ))}
        <button type="button" className="btn btn-default w-full" onClick={() => setIds((xs) => [...xs, crypto.randomUUID()])}>
          <FontAwesomeIcon icon={faPlus} /> Adicionar cortina
        </button>
      </div>

      {/* Coluna direita: resumo + instalação + total */}
      <div className="lg:col-span-1">
        <div className="card sticky p-4 max-w-form" style={{ top: 'calc(50px + 16px)' }}>
          <h4 className="text-lg-ui font-medium mb-3">Resumo</h4>

          <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3">
            {ids.map((id, i) => (
              <div key={id} className="flex justify-between py-1 text-xs-ui border-b border-neutral-200 last:border-b-0">
                <span className="text-neutral-600">
                  Cortina {i + 1}
                  {resumos[id] && !resumos[id].completo && <span className="text-warning"> (acessório a definir)</span>}
                </span>
                <span className="font-mono tabular-nums text-neutral-800">{formatBRL(resumos[id]?.total ?? 0)}</span>
              </div>
            ))}
          </div>

          <label className="form-label" htmlFor="instalacao">Instalação (R$)</label>
          <input id="instalacao" type="number" className="input mb-3" min={0} step={0.01} placeholder="0,00"
            value={instalacao} onChange={(e) => setInstalacao(e.target.value)} />

          <label className="form-label" htmlFor="total-cortina">Valor total</label>
          <input id="total-cortina" className="input input-mono mb-4" style={{ color: 'var(--color-success)', fontSize: 20 }}
            value={formatBRL(totalGeral)} readOnly tabIndex={-1} onClick={(e) => e.currentTarget.select()} />

          <div className="alert alert-info text-xs-ui">
            <FontAwesomeIcon icon={faCircleInfo} />
            <span>O envio do orçamento de cortina ao GestãoClick será habilitado na próxima etapa. Por ora, esta é a calculadora completa (com preços).</span>
          </div>
        </div>
      </div>
    </div>
  );
}
