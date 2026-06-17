// apps/web/src/components/CortinaOrcamento.tsx
// Orçamento de CORTINA (modelo "+" do Victor): N cortinas (ambientes), cada uma com
// camadas e seletores de acessório (CortinaCard). Soma o total (tecidos + acessórios
// + instalação) e envia ao GestãoClick (1 produto sintético por cortina + 1 serviço
// de instalação). O servidor RECALCULA tudo (não confia no cliente).

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSpinner, faPaperPlane, faFloppyDisk } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { CortinaCard, type CortinaResumo } from './CortinaCard';
import { formatBRL } from '../lib/formatacao';
import { useToast } from '../hooks/useToast';
import type { TecidoOpcao, ClienteResumo, OrcamentoSalvo } from '../lib/calcTypes';
import type { GcStatus } from '../hooks/useGcHealth';
import type { AcessoriosCortinaResp } from '../lib/cortinaTypes';

export function CortinaOrcamento({
  cliente, gcStatus, gcUsuarioId, onEnviado,
}: {
  cliente: ClienteResumo | null;
  gcStatus: GcStatus;
  gcUsuarioId: string | null;
  onEnviado: (orc: OrcamentoSalvo) => void;
}) {
  const { showToast } = useToast();
  const [tecidos, setTecidos] = useState<TecidoOpcao[]>([]);
  const [opcoes, setOpcoes] = useState<AcessoriosCortinaResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);

  const [ids, setIds] = useState<string[]>([crypto.randomUUID()]);
  const [resumos, setResumos] = useState<Record<string, CortinaResumo>>({});
  const [instalacao, setInstalacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);

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

  const todasCompletas = ids.length > 0 && ids.every((id) => resumos[id]?.completo && resumos[id]?.payload);
  const gcOffline = gcStatus !== 'online';
  const semVendedor = !gcUsuarioId;
  const ocupado = enviando || salvando;
  const podeEnviar = !gcOffline && !!cliente && todasCompletas && !ocupado;

  async function doSubmit(apenasSalvar: boolean) {
    if (!apenasSalvar && !podeEnviar) return;
    if (apenasSalvar && (ocupado || !todasCompletas)) return;
    if (apenasSalvar) setSalvando(true); else setEnviando(true);
    try {
      const cortinas = ids.map((id) => resumos[id]?.payload).filter(Boolean);
      const r = await api.post<{ orcamento: OrcamentoSalvo }>('/orcamentos/cortina', {
        cortinas,
        instalacao_valor: valorInstalacao,
        ...(cliente ? { gc_cliente_id: cliente.id, nome_cliente: cliente.nome } : {}),
        ...(apenasSalvar ? { apenas_salvar: true } : {}),
      });
      showToast('success', apenasSalvar ? 'Orçamento salvo (rascunho)' : `Orçamento #${r.orcamento.gc_orcamento_id} criado no GestãoClick`, cliente?.nome);
      onEnviado(r.orcamento);
    } catch (e) {
      const erro = e instanceof ApiError ? (e.data as { erro?: { message?: string } } | null)?.erro : null;
      showToast('error', apenasSalvar ? 'Erro ao salvar' : 'Erro ao enviar ao GestãoClick', erro?.message ?? (e instanceof ApiError ? e.message : 'Falha inesperada.'));
      const orc = e instanceof ApiError ? (e.data as { orcamento?: OrcamentoSalvo } | null)?.orcamento : null;
      if (orc) onEnviado(orc);
    } finally {
      if (apenasSalvar) setSalvando(false); else setEnviando(false);
    }
  }

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

      {/* Coluna direita: resumo + instalação + total + ações */}
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

          {!cliente && <div className="alert alert-info mb-3 text-xs-ui"><span>Selecione o <strong>cliente</strong> no topo para enviar (ou use <strong>Salvar</strong>).</span></div>}
          {!todasCompletas && <div className="alert alert-warning mb-3 text-xs-ui"><span>Escolha o <strong>produto de cada acessório</strong> em todas as cortinas para enviar.</span></div>}
          {gcOffline && <div className="alert alert-warning mb-3 text-xs-ui"><span>GestãoClick indisponível. Você ainda pode <strong>Salvar</strong>.</span></div>}
          {!gcOffline && semVendedor && <div className="alert alert-warning mb-3 text-xs-ui"><span>Seu usuário não está vinculado a um vendedor do GestãoClick — o orçamento sairá sem vendedor.</span></div>}

          <div className="flex gap-2">
            <button type="button" className="btn btn-default flex-1" disabled={ocupado || !todasCompletas} aria-disabled={ocupado || !todasCompletas} onClick={() => void doSubmit(true)} title="Salva sem enviar ao GestãoClick">
              {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar</>}
            </button>
            <button type="button" className="btn btn-success flex-1" disabled={!podeEnviar} aria-disabled={!podeEnviar} onClick={() => void doSubmit(false)}>
              {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faPaperPlane} /> Enviar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
