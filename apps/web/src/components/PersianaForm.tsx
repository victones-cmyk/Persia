// apps/web/src/components/PersianaForm.tsx
// Formulário de persiana MULTI-ITENS (SRD §8 Etapa 2A).
// Produto Sob Medida é único para o orçamento; cada item (janela) tem sua Coleção
// (Tecido), Cor, Acionamento, Largura, Altura, TC (75% editável, RN-04), Rolamento e Base.
// Layout compacto: 2 linhas agrupadas por item. RN-01 por item com chips de alternativos.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { roundHalfUp, formatBRL, formatNum } from '../lib/formatacao';
import { TecidoSearch } from './TecidoSearch';
import { MedidaInput } from './MedidaInput';
import { ConfirmModal } from './ConfirmModal';
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
  type ResultadoPersiana,
} from '../lib/calcTypes';
import type { PersianaSnapshot, PersianaItemSnap } from '../lib/rascunhoLocal';

interface ItemForm {
  id: string;
  ambiente: string;
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
  return { id: crypto.randomUUID(), ambiente: '', tecido_id: '', cor: '', acionamento: '', largura: '', altura: '', tc: '', tcManual: false, rolamento: '', base: '' };
}

/** Converte um item salvo (ItemInput) no estado do formulário (para edição de rascunho). */
function inputParaForm(it: ItemInput): ItemForm {
  return {
    id: crypto.randomUUID(),
    ambiente: it.ambiente ?? '',
    tecido_id: it.tecido_id,
    cor: it.cor_acessorio,
    acionamento: it.acionamento,
    largura: it.largura != null ? String(it.largura) : '',
    altura: it.altura != null ? String(it.altura) : '',
    tc: it.tc != null ? String(it.tc) : '',
    tcManual: it.tc != null,
    rolamento: it.rolamento ?? '',
    base: it.base ?? '',
  };
}

/** Converte um item bruto salvo (autosave local) no estado do formulário. */
function snapParaForm(s: PersianaItemSnap): ItemForm {
  return {
    id: crypto.randomUUID(),
    ambiente: s.ambiente ?? '',
    tecido_id: s.tecido_id,
    cor: s.cor as ItemForm['cor'],
    acionamento: s.acionamento as ItemForm['acionamento'],
    largura: s.largura,
    altura: s.altura,
    tc: s.tc,
    tcManual: s.tcManual,
    rolamento: s.rolamento,
    base: s.base,
  };
}

function formParaSnap(it: ItemForm): PersianaItemSnap {
  return {
    ambiente: it.ambiente, tecido_id: it.tecido_id, cor: it.cor, acionamento: it.acionamento,
    largura: it.largura, altura: it.altura, tc: it.tc, tcManual: it.tcManual,
    rolamento: it.rolamento, base: it.base,
  };
}

export function PersianaForm({
  onResult,
  inicial,
  restauro,
  onDirtyChange,
  onSnapshot,
}: {
  onResult: (dados: OrcamentoCalculado | null) => void;
  inicial?: { tipo: TipoPersiana; itens: ItemInput[] };
  restauro?: PersianaSnapshot; // autosave local (estado bruto)
  onDirtyChange?: (sujo: boolean) => void;
  onSnapshot?: (snap: PersianaSnapshot) => void;
}) {
  const [tipo, setTipo] = useState<TipoPersiana | ''>((restauro?.tipo as TipoPersiana | '') ?? inicial?.tipo ?? '');
  const [itens, setItens] = useState<ItemForm[]>(
    restauro && restauro.itens.length > 0
      ? restauro.itens.map(snapParaForm)
      : inicial && inicial.itens.length > 0
        ? inicial.itens.map(inputParaForm)
        : [itemVazio()],
  );
  const [mesmoAmbiente, setMesmoAmbiente] = useState(false);
  // Na 1ª carga (edição ou recuperação) o tipo já vem preenchido — não limpar o tecido.
  const pularResetTecido = useRef(!!(restauro || inicial));

  const [tecidos, setTecidos] = useState<TecidoOpcao[]>([]);
  const [carregandoTecidos, setCarregandoTecidos] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erros, setErros] = useState<Record<number, ItemErro>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [removerIdx, setRemoverIdx] = useState<number | null>(null);
  // Resultado calculado por item (índice → resultado), para o breakdown "Ver componentes".
  const [resultPorIdx, setResultPorIdx] = useState<Record<number, ResultadoPersiana>>({});

  // Recarrega tecidos quando o tipo muda; limpa a seleção de tecido de todos os itens.
  useEffect(() => {
    if (!tipo) {
      setTecidos([]);
      return;
    }
    setCarregandoTecidos(true);
    // Troca de tipo invalida os tecidos escolhidos — exceto na 1ª carga de um rascunho em edição.
    if (pularResetTecido.current) {
      pularResetTecido.current = false;
    } else {
      setItens((prev) => prev.map((it) => ({ ...it, tecido_id: '' })));
      setErros({});
      onResult(null);
    }
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
    if (!it.tcManual && a > 0) patch.tc = String(roundHalfUp(a * 0.75));
    atualizar(idx, patch);
  }

  function adicionarItem() {
    setItens((prev) => [...prev, itemVazio()]);
  }
  function executarRemover(idx: number) {
    // O cálculo automático (efeito abaixo) reavalia sozinho após a mudança.
    setItens((prev) => prev.filter((_, i) => i !== idx));
    setErros({});
    setRemoverIdx(null);
  }

  const itemValido = (it: ItemForm) =>
    it.tecido_id !== '' && it.cor !== '' && it.acionamento !== '' && Number(it.largura) > 0 && Number(it.altura) > 0;
  // Só os itens completos entram no cálculo; itens incompletos bloqueiam o envio.
  const itensComp = itens.map((it, idx) => ({ it, idx })).filter(({ it }) => itemValido(it));
  const temIncompleto = itens.some((it) => !itemValido(it));

  // "Sujo" = começou a preencher algo (guarda de navegação contra perda de dados).
  const sujo = tipo !== '' || itens.some((it) =>
    it.ambiente || it.tecido_id || it.cor || it.acionamento || it.largura || it.altura || it.tc || it.rolamento || it.base);
  useEffect(() => { onDirtyChange?.(sujo); }, [sujo, onDirtyChange]);
  // Autosave local: emite o estado bruto sempre que muda.
  useEffect(() => { onSnapshot?.({ tipo, itens: itens.map(formParaSnap) }); }, [tipo, itens, onSnapshot]);

  function toInput(it: ItemForm): ItemInput {
    return {
      ambiente: it.ambiente || undefined,
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

  // Cálculo automático (tempo real): recalcula com debounce a cada mudança. Calcula
  // só os itens completos; itens incompletos não somem o resultado, mas bloqueiam o envio.
  const calcSig = JSON.stringify({
    tipo,
    itens: itens.map((it) => ({ t: it.tecido_id, c: it.cor, a: it.acionamento, l: it.largura, h: it.altura, tc: it.tc })),
  });
  useEffect(() => {
    if (tipo === '' || itensComp.length === 0) { onResult(null); setResultPorIdx({}); return; }
    const comp = itensComp;
    const incompleto = temIncompleto;
    const id = setTimeout(() => { void calcularCom(comp, incompleto); }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcSig]);

  async function calcularCom(comp: { it: ItemForm; idx: number }[], incompleto: boolean) {
    setCalculando(true);
    setErros({});
    setErroGeral(null);
    try {
      const r = await api.post<CalcularLoteResposta>('/calcular/persiana/lote', {
        tipo,
        itens: comp.map(({ it }) => toInput(it)),
      });

      const novosErros: Record<number, ItemErro> = {};
      const calculados: ItemCalculado[] = [];
      const novosResultados: Record<number, ResultadoPersiana> = {};
      for (const res of r.itens) {
        const origIdx = comp[res.index]?.idx ?? res.index;
        if (res.ok) {
          calculados.push({ input: toInput(comp[res.index].it), resultado: res.resultado, tecido: res.tecido });
          novosResultados[origIdx] = res.resultado;
        } else {
          novosErros[origIdx] = { message: res.message, alternativos: res.alternativos };
        }
      }
      setResultPorIdx(novosResultados);

      if (Object.keys(novosErros).length > 0) {
        setErros(novosErros);
        onResult(null);
        return;
      }
      onResult({ tipo: tipo as TipoPersiana, itens: calculados, total_bruto: r.total_bruto, incompleto });
    } catch {
      onResult(null);
      setErroGeral('Não foi possível calcular. Tente novamente.');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="card p-4">
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
                  onClick={() => setRemoverIdx(idx)}
                  title="Remover item"
                >
                  <FontAwesomeIcon icon={faTrash} /> Remover
                </button>
              )}
            </div>

            {/* Ambiente (identifica a janela; aparece no orçamento) */}
            <div className="mb-3">
              <label className="form-label">Ambiente</label>
              <input className="input" value={it.ambiente} onChange={(e) => atualizar(idx, { ambiente: e.target.value })} placeholder="Ex.: Sala, Quarto 1…" />
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
                <MedidaInput className={erros[idx] ? 'input input-error' : 'input'}
                  value={it.largura} onChange={(v) => { atualizar(idx, { largura: v }); setErros((p) => { const n = { ...p }; delete n[idx]; return n; }); }} />
              </div>
              <div>
                <label className="form-label">Altura (m)<span className="label-required">*</span></label>
                <MedidaInput value={it.altura} onChange={(v) => onAlturaChange(idx, v)} />
              </div>
              <div>
                <label className="form-label" title="75% da altura, editável (RN-04)">TC (m)</label>
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
                        {a.nome} ({formatNum(a.dimensao_m)} m)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Resultado do item: valor + breakdown por componente (motor novo) */}
            {resultPorIdx[idx] && resultPorIdx[idx].valor_bruto != null && (
              <div className="mt-3 pt-2 border-t border-neutral-200">
                <div className="flex justify-between items-center">
                  <span className="text-xs-ui text-neutral-500">Subtotal do item</span>
                  <span className="font-mono font-semibold tabular-nums text-sm-ui">{formatBRL(resultPorIdx[idx].valor_bruto)}</span>
                </div>
                {resultPorIdx[idx].itens && resultPorIdx[idx].itens!.length > 0 && (
                  <details className="mt-1">
                    <summary className="text-2xs-ui text-neutral-500 cursor-pointer select-none hover:text-neutral-700">Ver componentes</summary>
                    <table className="w-full text-2xs-ui mt-1 tabular-nums">
                      <tbody>
                        {resultPorIdx[idx].itens!.map((c, j) => (
                          <tr key={j} className="text-neutral-600">
                            <td className="pr-1 py-0.5">{c.descricao}</td>
                            <td className="px-1 py-0.5 text-right whitespace-nowrap text-neutral-400">{formatNum(c.quantidade)} × {formatBRL(c.preco)}</td>
                            <td className="pl-1 py-0.5 text-right font-mono whitespace-nowrap">{formatBRL(c.subtotal)}</td>
                          </tr>
                        ))}
                        {resultPorIdx[idx].tecido && (
                          <tr className="text-neutral-700 font-medium border-t border-neutral-200">
                            <td className="pr-1 py-0.5">Tecido</td>
                            <td className="px-1 py-0.5 text-right whitespace-nowrap text-neutral-400">{formatNum(resultPorIdx[idx].tecido!.quantidade)} × {formatBRL(resultPorIdx[idx].tecido!.preco)}</td>
                            <td className="pl-1 py-0.5 text-right font-mono whitespace-nowrap">{formatBRL(resultPorIdx[idx].tecido!.subtotal)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </details>
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

        <div className="text-xs-ui text-neutral-500 flex items-center gap-2" aria-live="polite">
          {calculando
            ? <><FontAwesomeIcon icon={faSpinner} spin /> Calculando…</>
            : 'O cálculo é feito automaticamente conforme você preenche. Veja o resultado ao lado.'}
        </div>
      </div>

      <ConfirmModal
        aberto={removerIdx !== null}
        titulo="Remover item"
        mensagem={`Deseja remover o Item ${(removerIdx ?? 0) + 1} do orçamento?`}
        confirmarLabel="Remover"
        cancelarLabel="Voltar"
        perigo
        onConfirmar={() => removerIdx !== null && executarRemover(removerIdx)}
        onCancelar={() => setRemoverIdx(null)}
      />
    </div>
  );
}
