// apps/web/src/components/PersianaForm.tsx
// Formulário de persiana MULTI-ITENS (SRD §8 Etapa 2A).
// Produto Sob Medida é único para o orçamento; cada item (janela) tem sua Coleção
// (Tecido), Cor, Acionamento, Largura, Altura, TC (70% editável, RN-04), Rolamento e Base.
// Layout compacto: 2 linhas agrupadas por item. RN-01 por item com chips de alternativos.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCalculator, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { roundHalfUp } from '../lib/formatacao';
import { TecidoSearch } from './TecidoSearch';
import {
  TIPOS_PERSIANA,
  CORES,
  ACIONAMENTOS,
  ROLAMENTOS,
  type TipoPersiana,
  type Cor,
  type Acionamento,
  type TecidoOpcao,
  type ItemInput,
  type ItemCalculado,
  type CalcularLoteResposta,
  type OrcamentoCalculado,
} from '../lib/calcTypes';

interface ItemForm {
  id: string;
  tecido_id: string;
  cor: Cor | '';
  acionamento: Acionamento | '';
  largura: string;
  altura: string;
  tc: string;
  tcManual: boolean;
  rolamento: string;
  base: string;
}

interface ItemErro {
  message: string;
  alternativos?: { id: string; nome: string; dimensao_m: number }[];
}

function itemVazio(): ItemForm {
  return { id: crypto.randomUUID(), tecido_id: '', cor: '', acionamento: '', largura: '', altura: '', tc: '', tcManual: false, rolamento: '', base: '' };
}

export function PersianaForm({
  onResult,
}: {
  onResult: (dados: OrcamentoCalculado | null) => void;
}) {
  const [tipo, setTipo] = useState<TipoPersiana | ''>('');
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()]);
  const [mesmoAmbiente, setMesmoAmbiente] = useState(false);

  const [tecidos, setTecidos] = useState<TecidoOpcao[]>([]);
  const [carregandoTecidos, setCarregandoTecidos] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erros, setErros] = useState<Record<number, ItemErro>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  // Recarrega tecidos quando o tipo muda; limpa a seleção de tecido de todos os itens.
  useEffect(() => {
    if (!tipo) {
      setTecidos([]);
      return;
    }
    setCarregandoTecidos(true);
    setItens((prev) => prev.map((it) => ({ ...it, tecido_id: '' })));
    setErros({});
    onResult(null);
    api
      .get<{ tecidos: TecidoOpcao[] }>(`/calcular/tecidos?tipo=${tipo}`)
      .then((r) => setTecidos(r.tecidos))
      .catch(() => setTecidos([]))
      .finally(() => setCarregandoTecidos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  function atualizar(idx: number, patch: Partial<ItemForm>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function onAlturaChange(idx: number, v: string) {
    const it = itens[idx];
    const a = Number(v);
    const patch: Partial<ItemForm> = { altura: v };
    if (!it.tcManual && a > 0) patch.tc = String(roundHalfUp(a * 0.7));
    atualizar(idx, patch);
  }

  function adicionarItem() {
    setItens((prev) => [...prev, itemVazio()]);
  }
  function removerItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx));
    setErros({});
    onResult(null);
  }

  const itemValido = (it: ItemForm) =>
    it.tecido_id !== '' && it.cor !== '' && it.acionamento !== '' && Number(it.largura) > 0 && Number(it.altura) > 0;
  const formValido = tipo !== '' && itens.length > 0 && itens.every(itemValido);

  function toInput(it: ItemForm): ItemInput {
    return {
      tecido_id: it.tecido_id,
      cor_acessorio: it.cor as Cor,
      acionamento: it.acionamento as Acionamento,
      largura: Number(it.largura),
      altura: Number(it.altura),
      tc: it.tc === '' ? undefined : Number(it.tc),
      rolamento: it.rolamento || null,
      base: it.base || null,
    };
  }

  async function calcular() {
    if (!formValido || calculando) return;
    setCalculando(true);
    setErros({});
    setErroGeral(null);
    onResult(null);
    try {
      const r = await api.post<CalcularLoteResposta>('/calcular/persiana/lote', {
        tipo,
        itens: itens.map(toInput),
      });

      const novosErros: Record<number, ItemErro> = {};
      const calculados: ItemCalculado[] = [];
      for (const res of r.itens) {
        if (res.ok) {
          calculados[res.index] = { input: toInput(itens[res.index]), resultado: res.resultado, tecido: res.tecido };
        } else {
          novosErros[res.index] = { message: res.message, alternativos: res.alternativos };
        }
      }

      if (Object.keys(novosErros).length > 0) {
        setErros(novosErros);
        onResult(null);
        return;
      }
      onResult({ tipo: tipo as TipoPersiana, itens: calculados.filter(Boolean), total_bruto: r.total_bruto });
    } catch {
      onResult(null);
      setErroGeral('Não foi possível calcular. Tente novamente.');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="card p-4 max-w-form">
      <h4 className="text-lg-ui font-medium mb-4">Dados da Persiana</h4>

      <div className="space-y-4">
        {/* Produto Sob Medida — único para o orçamento */}
        <div>
          <label className="form-label" htmlFor="f-tipo">
            Produto Sob Medida<span className="label-required">*</span>
          </label>
          <select id="f-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPersiana)}>
            <option value="">Selecione…</option>
            {TIPOS_PERSIANA.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Itens (janelas) */}
        {itens.map((it, idx) => (
          <div key={it.id} className="rounded-sm border border-neutral-300 p-3" style={{ background: 'var(--neutral-50)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs-ui font-bold text-neutral-600">Item {idx + 1}</span>
              {itens.length > 1 && (
                <button
                  type="button"
                  className="text-error hover:opacity-80 text-xs-ui flex items-center gap-1"
                  onClick={() => removerItem(idx)}
                  title="Remover item"
                >
                  <FontAwesomeIcon icon={faTrash} /> Remover
                </button>
              )}
            </div>

            {/* Linha 1: Coleção (Tecido) · Cor · Acionamento */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-2">
                <label className="form-label">Coleção (Tecido)<span className="label-required">*</span></label>
                {carregandoTecidos ? (
                  <div className="skeleton" style={{ height: 38 }} />
                ) : (
                  <TecidoSearch
                    tecidos={tecidos}
                    value={it.tecido_id}
                    onChange={(id) => atualizar(idx, { tecido_id: id })}
                    disabled={!tipo}
                    placeholder={tipo ? 'Buscar tecido…' : 'Escolha o produto'}
                  />
                )}
              </div>
              <div>
                <label className="form-label">Cor Acessório<span className="label-required">*</span></label>
                <select className="input" value={it.cor} onChange={(e) => atualizar(idx, { cor: e.target.value as Cor })}>
                  <option value="">—</option>
                  {CORES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Acionamento<span className="label-required">*</span></label>
                <select className="input" value={it.acionamento} onChange={(e) => atualizar(idx, { acionamento: e.target.value as Acionamento })}>
                  <option value="">—</option>
                  {ACIONAMENTOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>

            {/* Linha 2: Largura · Altura · TC · Rolamento · Base */}
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="form-label">Largura (m)<span className="label-required">*</span></label>
                <input type="number" className={erros[idx] ? 'input input-error' : 'input'} min={0} step={0.01}
                  value={it.largura} onChange={(e) => { atualizar(idx, { largura: e.target.value }); setErros((p) => { const n = { ...p }; delete n[idx]; return n; }); }} />
              </div>
              <div>
                <label className="form-label">Altura (m)<span className="label-required">*</span></label>
                <input type="number" className="input" min={0} step={0.01}
                  value={it.altura} onChange={(e) => onAlturaChange(idx, e.target.value)} />
              </div>
              <div>
                <label className="form-label" title="70% da altura, editável (RN-04)">TC (m)</label>
                <input type="number" className="input" min={0.01} step={0.01}
                  value={it.tc} onChange={(e) => atualizar(idx, { tc: e.target.value, tcManual: true })} />
              </div>
              <div>
                <label className="form-label">Rolamento</label>
                <select className="input" value={it.rolamento} onChange={(e) => atualizar(idx, { rolamento: e.target.value })}>
                  <option value="">—</option>
                  {ROLAMENTOS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Base</label>
                <select className="input" value={it.base} onChange={(e) => atualizar(idx, { base: e.target.value })}>
                  <option value="">—</option>
                  {CORES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* RN-01: erro de largura máxima + chips de alternativos (por item) */}
            {erros[idx] && (
              <div className="mt-2" style={{ padding: '8px 10px', background: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)', borderRadius: 4, color: '#721c24' }}>
                <div className="text-xs-ui font-semibold">{erros[idx].message}</div>
                {erros[idx].alternativos && erros[idx].alternativos!.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs-ui">Tecidos compatíveis:</span>
                    {erros[idx].alternativos!.map((a) => (
                      <button key={a.id} type="button"
                        onClick={() => { atualizar(idx, { tecido_id: a.id }); setErros((p) => { const n = { ...p }; delete n[idx]; return n; }); }}
                        style={{ padding: '4px 10px', border: '1px solid var(--action-add)', borderRadius: 3, fontSize: 12, color: 'var(--action-add)', background: 'transparent' }}>
                        {a.nome} ({a.dimensao_m.toFixed(2)}m)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <button type="button" className="btn btn-default w-full" onClick={adicionarItem} disabled={!tipo}>
          <FontAwesomeIcon icon={faPlus} /> Adicionar item
        </button>

        <label className="flex items-center gap-2 text-md-ui">
          <input type="checkbox" checked={mesmoAmbiente} onChange={(e) => setMesmoAmbiente(e.target.checked)} style={{ accentColor: 'var(--action-add)' }} />
          Mesmo Ambiente
        </label>

        {erroGeral && <div className="helper-error">{erroGeral}</div>}

        <button type="button" className="btn btn-success w-full" disabled={!formValido || calculando} aria-disabled={!formValido || calculando} onClick={calcular}>
          {calculando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faCalculator} /> Calcular</>}
        </button>
      </div>
    </div>
  );
}
