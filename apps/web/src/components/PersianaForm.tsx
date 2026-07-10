// apps/web/src/components/PersianaForm.tsx
// Formulário de persiana MULTI-ITENS (SRD §8 Etapa 2A).
// Victor (26/06/2026): o PRODUTO SOB MEDIDA e a INSTALAÇÃO são POR ITEM — cada janela
// escolhe seu tipo de persiana (com sua lista de tecidos) e seu tipo de instalação
// (grupo INSTALAÇÃO), que entra embutida no preço. A instalação é sugerida pelo
// acionamento (motorizado → MOTORIZADA; senão → MANUAL), mas é editável.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPlus, faTrash, faCopy } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { getCacheado } from '../lib/dadosCache';
import { roundHalfUp, formatBRL, formatNum, formatQtd } from '../lib/formatacao';
import { TecidoSearch } from './TecidoSearch';
import { MedidaInput } from './MedidaInput';
import { ConfirmModal } from './ConfirmModal';
import {
  CORES,
  ACIONAMENTOS,
  ROLAMENTOS,
  COMANDOS,
  type TipoPersiana,
  type Cor,
  type Acionamento,
  type TecidoOpcao,
  type TipoInstalacao,
  type ItemInput,
  type ItemCalculado,
  type CalcularLoteResposta,
  type OrcamentoCalculado,
  type ResultadoPersiana,
  type CalculadoraPersiana,
} from '../lib/calcTypes';

import type { PersianaSnapshot, PersianaItemSnap } from '../lib/rascunhoLocal';

interface ItemForm {
  id: string;
  ambiente: string;
  tipo: TipoPersiana | '';
  tecido_id: string;
  cor: Cor | '';
  acionamento: Acionamento | '';
  largura: string;
  altura: string;
  tc: string;
  tcManual: boolean;
  rolamento: string;
  base: string;
  comando: string;
  fixacao_instalacao: string;
  instalacao_id: string;
  instManual: boolean;
}

interface ItemErro {
  message: string;
  alternativos?: { id: string; nome: string; dimensao_m: number }[];
}

function itemVazio(): ItemForm {
  return { id: crypto.randomUUID(), ambiente: '', tipo: '', tecido_id: '', cor: '', acionamento: '', largura: '', altura: '', tc: '', tcManual: false, rolamento: '', base: '', comando: '', fixacao_instalacao: '', instalacao_id: '', instManual: false };
}

const ehMotorizado = (ac: string) => ac === 'motorizado_com_bando' || ac === 'motorizado_sem_bando';

function normalizarRolamento(valor: string | null | undefined): string {
  if (valor === 'Dianteiro') return 'Normal';
  if (valor === 'Traseiro') return 'Invertido';
  return valor ?? '';
}

/** Instalação sugerida pelo acionamento: motorizado → MOTORIZADA; senão → MANUAL (com fallbacks). */
function sugerirInstalacao(instalacoes: TipoInstalacao[], acionamento: string): string {
  if (instalacoes.length === 0 || !acionamento) return '';
  const motor = /motoriz/i;
  if (ehMotorizado(acionamento)) {
    return (instalacoes.find((i) => motor.test(i.nome)) ?? instalacoes[0]).id;
  }
  return (instalacoes.find((i) => /manual/i.test(i.nome)) ?? instalacoes.find((i) => !motor.test(i.nome)) ?? instalacoes[0]).id;
}

/** Converte um item salvo (ItemInput) no estado do formulário (para edição de rascunho). */
function inputParaForm(it: ItemInput, tipoFallback: TipoPersiana | ''): ItemForm {
  return {
    id: crypto.randomUUID(),
    ambiente: it.ambiente ?? '',
    tipo: it.tipo ?? tipoFallback,
    tecido_id: it.tecido_id,
    cor: it.cor_acessorio,
    acionamento: it.acionamento,
    largura: it.largura != null ? String(it.largura) : '',
    altura: it.altura != null ? String(it.altura) : '',
    tc: it.tc != null ? String(it.tc) : '',
    tcManual: it.tc != null,
    rolamento: normalizarRolamento(it.rolamento),
    base: it.base ?? '',
    comando: it.comando ?? '',
    fixacao_instalacao: it.fixacao_instalacao ?? '',
    instalacao_id: it.instalacao_id ?? '',
    instManual: it.instalacao_id != null && it.instalacao_id !== '',
  };
}

/** Converte um item bruto salvo (autosave local) no estado do formulário. */
function snapParaForm(s: PersianaItemSnap, tipoFallback: TipoPersiana | ''): ItemForm {
  return {
    id: crypto.randomUUID(),
    ambiente: s.ambiente ?? '',
    tipo: (s.tipo as ItemForm['tipo']) || tipoFallback,
    tecido_id: s.tecido_id,
    cor: s.cor as ItemForm['cor'],
    acionamento: s.acionamento as ItemForm['acionamento'],
    largura: s.largura,
    altura: s.altura,
    tc: s.tc,
    tcManual: s.tcManual,
    rolamento: normalizarRolamento(s.rolamento),
    base: s.base,
    comando: s.comando ?? '',
    fixacao_instalacao: s.fixacao_instalacao ?? '',
    instalacao_id: s.instalacao_id ?? '',
    instManual: s.instManual ?? false,
  };
}

function formParaSnap(it: ItemForm): PersianaItemSnap {
  return {
    ambiente: it.ambiente, tipo: it.tipo, tecido_id: it.tecido_id, cor: it.cor, acionamento: it.acionamento,
    largura: it.largura, altura: it.altura, tc: it.tc, tcManual: it.tcManual,
    rolamento: it.rolamento, base: it.base, comando: it.comando, fixacao_instalacao: it.fixacao_instalacao, instalacao_id: it.instalacao_id, instManual: it.instManual,
  };
}

export function PersianaForm({
  onResult,
  inicial,
  restauro,
  onDirtyChange,
  onSnapshot,
  onCalculandoChange,
}: {
  onResult: (dados: OrcamentoCalculado | null) => void;
  inicial?: { tipo: TipoPersiana; itens: ItemInput[] };
  restauro?: PersianaSnapshot; // autosave local (estado bruto)
  onDirtyChange?: (sujo: boolean) => void;
  onSnapshot?: (snap: PersianaSnapshot) => void;
  onCalculandoChange?: (calculando: boolean) => void;
}) {
  const tipoFallback: TipoPersiana | '' = (restauro?.tipo as TipoPersiana | '') || inicial?.tipo || '';
  const [itens, setItens] = useState<ItemForm[]>(
    restauro && restauro.itens.length > 0
      ? restauro.itens.map((s) => snapParaForm(s, tipoFallback))
      : inicial && inicial.itens.length > 0
        ? inicial.itens.map((it) => inputParaForm(it, tipoFallback))
        : [itemVazio()],
  );
  const [mesmoAmbiente, setMesmoAmbiente] = useState(false);

  // Lista de calculadoras de persianas carregadas dinamicamente
  const [calculadoras, setCalculadoras] = useState<CalculadoraPersiana[]>([]);
  // Tecidos por TIPO (cada item escolhe seu tipo): carregados sob demanda e cacheados.
  const [tecidosPorTipo, setTecidosPorTipo] = useState<Record<string, TecidoOpcao[]>>({});
  const [tiposCarregando, setTiposCarregando] = useState<string[]>([]);
  const emVoo = useRef<Set<string>>(new Set());
  // Tipos de instalação (grupo INSTALAÇÃO do GestãoClick).
  const [instalacoes, setInstalacoes] = useState<TipoInstalacao[]>([]);

  const [calculando, setCalculando] = useState(false);
  const [erros, setErros] = useState<Record<number, ItemErro>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [removerIdx, setRemoverIdx] = useState<number | null>(null);
  // Resultado calculado por item (índice → resultado), para o breakdown "Ver componentes".
  const [resultPorIdx, setResultPorIdx] = useState<Record<number, ResultadoPersiana>>({});

  // Carrega os tecidos de um tipo (uma vez por tipo).
  function garantirTecidos(tipo: string) {
    if (!tipo || tecidosPorTipo[tipo] || emVoo.current.has(tipo)) return;
    emVoo.current.add(tipo);
    setTiposCarregando((p) => (p.includes(tipo) ? p : [...p, tipo]));
    getCacheado<{ tecidos: TecidoOpcao[] }>(`persiana-tecidos:${tipo}`, `/calcular/tecidos?tipo=${tipo}`)
      .then((r) => setTecidosPorTipo((p) => ({ ...p, [tipo]: r.tecidos })))
      .catch(() => setTecidosPorTipo((p) => ({ ...p, [tipo]: [] })))
      .finally(() => {
        emVoo.current.delete(tipo);
        setTiposCarregando((p) => p.filter((t) => t !== tipo));
      });
  }

  // Carrega as calculadoras, tecidos dos tipos já presentes (restauro/edição) e a lista de instalações.
  useEffect(() => {
    getCacheado<{ calculadoras: CalculadoraPersiana[] }>('persiana-calculadoras', '/calcular/calculadoras')
      .then((r) => {
        setCalculadoras(r.calculadoras);
      })
      .catch(() => setCalculadoras([]));

    for (const it of itens) if (it.tipo) garantirTecidos(it.tipo);
    getCacheado<{ instalacoes: TipoInstalacao[] }>('instalacoes', '/calcular/instalacoes')
      .then((r) => setInstalacoes(r.instalacoes))
      .catch(() => setInstalacoes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Quando a lista de instalações chega, preenche o sugerido nos itens ainda sem escolha.
  useEffect(() => {
    if (instalacoes.length === 0) return;
    setItens((prev) => prev.map((it) =>
      !it.instManual && !it.instalacao_id && it.acionamento
        ? { ...it, instalacao_id: sugerirInstalacao(instalacoes, it.acionamento) }
        : it));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instalacoes]);

  function atualizar(idx: number, patch: Partial<ItemForm>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function onTipoChange(idx: number, novoTipo: TipoPersiana | '') {
    garantirTecidos(novoTipo);
    // Trocar de tipo invalida o tecido escolhido (a lista muda).
    atualizar(idx, { tipo: novoTipo, tecido_id: '' });
    setErros((p) => { const n = { ...p }; delete n[idx]; return n; });
  }

  function onAcionamentoChange(idx: number, ac: Acionamento) {
    const it = itens[idx];
    const patch: Partial<ItemForm> = { acionamento: ac };
    // Sugere a instalação pelo acionamento, a menos que o vendedor já tenha escolhido manualmente.
    if (!it.instManual && instalacoes.length > 0) patch.instalacao_id = sugerirInstalacao(instalacoes, ac);
    atualizar(idx, patch);
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
    setItens((prev) => prev.filter((_, i) => i !== idx));
    setErros({});
    setRemoverIdx(null);
  }

  function duplicarItem(idx: number) {
    const orig = itens[idx];
    const copia: ItemForm = {
      ...orig,
      id: crypto.randomUUID(),
    };
    setItens((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copia);
      return next;
    });
  }

  const itemValido = (it: ItemForm) =>
    it.tipo !== '' && it.tecido_id !== '' && it.cor !== '' && it.acionamento !== '' && Number(it.largura) > 0 && Number(it.altura) > 0;
  // Só os itens completos entram no cálculo; itens incompletos bloqueiam o envio.
  const itensComp = itens.map((it, idx) => ({ it, idx })).filter(({ it }) => itemValido(it));
  const temIncompleto = itens.some((it) => !itemValido(it));

  // "Sujo" = começou a preencher algo (guarda de navegação contra perda de dados).
  const sujo = itens.some((it) =>
    it.tipo || it.ambiente || it.tecido_id || it.cor || it.acionamento || it.largura || it.altura || it.tc || it.rolamento || it.base || it.comando || it.fixacao_instalacao);
  useEffect(() => { onDirtyChange?.(sujo); }, [sujo, onDirtyChange]);
  // Autosave local: emite o estado bruto sempre que muda (tipo representativo = 1º item).
  useEffect(() => { onSnapshot?.({ tipo: itens[0]?.tipo ?? '', itens: itens.map(formParaSnap) }); }, [itens, onSnapshot]);

  function toInput(it: ItemForm): ItemInput {
    return {
      ambiente: it.ambiente || undefined,
      tipo: it.tipo as TipoPersiana,
      tecido_id: it.tecido_id,
      cor_acessorio: it.cor as Cor,
      acionamento: it.acionamento as Acionamento,
      largura: Number(it.largura),
      altura: Number(it.altura),
      tc: it.tc === '' ? undefined : Number(it.tc),
      rolamento: it.rolamento || null,
      base: it.base || null,
      comando: it.comando || null,
      fixacao_instalacao: it.fixacao_instalacao === 'teto' || it.fixacao_instalacao === 'parede' ? it.fixacao_instalacao : null,
      instalacao_id: it.instalacao_id || null,
    };
  }

  // Cálculo automático (tempo real): recalcula com debounce a cada mudança. Calcula
  // só os itens completos; itens incompletos não somem o resultado, mas bloqueiam o envio.
  const calcSig = JSON.stringify({
    itens: itens.map((it) => ({ tp: it.tipo, t: it.tecido_id, c: it.cor, a: it.acionamento, l: it.largura, h: it.altura, tc: it.tc, r: it.rolamento, b: it.base, co: it.comando, fx: it.fixacao_instalacao, in: it.instalacao_id })),
  });
  const seqCalc = useRef(0);
  useEffect(() => {
    seqCalc.current += 1;
    const seq = seqCalc.current;
    if (itensComp.length === 0) { setCalculando(false); onCalculandoChange?.(false); onResult(null); setResultPorIdx({}); return; }
    const comp = itensComp;
    const incompleto = temIncompleto;
    setCalculando(true);
    onCalculandoChange?.(true);
    const id = setTimeout(() => { void calcularCom(comp, incompleto, seq); }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcSig]);

  async function calcularCom(comp: { it: ItemForm; idx: number }[], incompleto: boolean, seq: number) {
    setCalculando(true);
    setErros({});
    setErroGeral(null);
    try {
      const r = await api.post<CalcularLoteResposta>('/calcular/persiana/lote', {
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
      if (seq !== seqCalc.current) return;
      setResultPorIdx(novosResultados);

      if (Object.keys(novosErros).length > 0) {
        setErros(novosErros);
        onResult(null);
        return;
      }
      onResult({ tipo: (comp[0].it.tipo || (calculadoras[0]?.id ?? 'persiana_rolo_blackout')) as TipoPersiana, itens: calculados, total_bruto: r.total_bruto, incompleto });

    } catch {
      if (seq !== seqCalc.current) return;
      onResult(null);
      setErroGeral('Não foi possível calcular. Tente novamente.');
    } finally {
      if (seq !== seqCalc.current) return;
      setCalculando(false);
      onCalculandoChange?.(false);
    }
  }

  return (
    <div className="card p-4">
      <h4 className="text-lg-ui font-medium mb-4">Dados da Persiana</h4>

      <div className="space-y-4">
        {/* Itens (janelas) — cada um com seu Produto Sob Medida + Instalação */}
        {itens.map((it, idx) => {
          const tecidosDoItem = it.tipo ? tecidosPorTipo[it.tipo] : undefined;
          const carregandoTecidos = it.tipo ? tiposCarregando.includes(it.tipo) && !tecidosDoItem : false;
          return (
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

            {/* Ambiente + Produto Sob Medida */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="form-label" htmlFor={`ambiente-persiana-${idx}`}>Ambiente</label>
                <input id={`ambiente-persiana-${idx}`} className="input" value={it.ambiente} onChange={(e) => atualizar(idx, { ambiente: e.target.value })} placeholder="Ex.: Sala, Quarto 1…" />
              </div>
              <div>
                <label className="form-label" htmlFor={`produto-persiana-${idx}`}>Produto Sob Medida<span className="label-required">*</span></label>
                <select id={`produto-persiana-${idx}`} className="input" value={it.tipo} onChange={(e) => onTipoChange(idx, e.target.value as TipoPersiana)}>
                  <option value="">Selecione…</option>
                  {calculadoras.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
            </div>

            {/* Linha 1: Coleção (Tecido) · Cor · Acionamento */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-2">
                <label className="form-label" htmlFor={`tecido-persiana-${idx}`}>Coleção (Tecido)<span className="label-required">*</span></label>
                {carregandoTecidos ? (
                  <div className="skeleton" style={{ height: 38 }} />
                ) : (
                  <TecidoSearch
                    tecidos={tecidosDoItem ?? []}
                    value={it.tecido_id}
                    onChange={(id) => atualizar(idx, { tecido_id: id })}
                    disabled={!it.tipo}
                    placeholder={it.tipo ? 'Buscar tecido…' : 'Escolha o produto'}
                    id={`tecido-persiana-${idx}`}
                  />
                )}
              </div>
              <div>
                <label className="form-label" htmlFor={`cor-persiana-${idx}`}>Cor Acessório<span className="label-required">*</span></label>
                <select id={`cor-persiana-${idx}`} className="input" value={it.cor} onChange={(e) => atualizar(idx, { cor: e.target.value as Cor })}>
                  <option value="">—</option>
                  {CORES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor={`acionamento-persiana-${idx}`}>Acionamento<span className="label-required">*</span></label>
                <select id={`acionamento-persiana-${idx}`} className="input" value={it.acionamento} onChange={(e) => onAcionamentoChange(idx, e.target.value as Acionamento)}>
                  <option value="">—</option>
                  {ACIONAMENTOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>

            {/* Linha 2: Largura · Altura · TC · Rolamento · Base */}
            <div className="grid grid-cols-5 gap-3 mb-3">
              <div>
                <label className="form-label" htmlFor={`largura-persiana-${idx}`}>Largura (m)<span className="label-required">*</span></label>
                <MedidaInput id={`largura-persiana-${idx}`} className={erros[idx] ? 'input input-error' : 'input'}
                  value={it.largura} onChange={(v) => { atualizar(idx, { largura: v }); setErros((p) => { const n = { ...p }; delete n[idx]; return n; }); }} />
              </div>
              <div>
                <label className="form-label" htmlFor={`altura-persiana-${idx}`}>Altura (m)<span className="label-required">*</span></label>
                <MedidaInput id={`altura-persiana-${idx}`} value={it.altura} onChange={(v) => onAlturaChange(idx, v)} />
              </div>
              <div>
                <label className="form-label" htmlFor={`tc-persiana-${idx}`} title="75% da altura, editável (RN-04)">TC (m)</label>
                <input id={`tc-persiana-${idx}`} type="number" className="input" min={0.01} step={0.01}
                  value={it.tc} onChange={(e) => atualizar(idx, { tc: e.target.value, tcManual: true })} />
              </div>
              <div>
                <label className="form-label" htmlFor={`rolamento-persiana-${idx}`}>Rolamento</label>
                <select id={`rolamento-persiana-${idx}`} className="input" value={it.rolamento} onChange={(e) => atualizar(idx, { rolamento: e.target.value })}>
                  <option value="">—</option>
                  {ROLAMENTOS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor={`base-persiana-${idx}`}>Base</label>
                <select id={`base-persiana-${idx}`} className="input" value={it.base} onChange={(e) => atualizar(idx, { base: e.target.value })}>
                  <option value="">—</option>
                  {CORES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Instalação (embutida no preço) — sugerida pelo acionamento, editável */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label" htmlFor={`comando-persiana-${idx}`}>Comando</label>
                <select id={`comando-persiana-${idx}`} className="input" value={it.comando} onChange={(e) => atualizar(idx, { comando: e.target.value })}>
                  <option value="">—</option>
                  {COMANDOS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor={`fixacao-persiana-${idx}`}>Fixação</label>
                <select id={`fixacao-persiana-${idx}`} className="input" value={it.fixacao_instalacao} onChange={(e) => atualizar(idx, { fixacao_instalacao: e.target.value })}>
                  <option value="">—</option>
                  <option value="teto">Teto</option>
                  <option value="parede">Parede</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor={`instalacao-persiana-${idx}`}>Instalação</label>
                <select id={`instalacao-persiana-${idx}`} className="input" value={it.instalacao_id}
                  onChange={(e) => atualizar(idx, { instalacao_id: e.target.value, instManual: true })}>
                  <option value="">Sem instalação</option>
                  {instalacoes.map((i) => <option key={i.id} value={i.id}>{i.nome} — {formatBRL(i.preco)}</option>)}
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
                            <td className="px-1 py-0.5 text-right whitespace-nowrap text-neutral-400">{formatQtd(c.quantidade)} × {formatBRL(c.preco)}</td>
                            <td className="pl-1 py-0.5 text-right font-mono whitespace-nowrap">{formatBRL(c.subtotal)}</td>
                          </tr>
                        ))}
                        {resultPorIdx[idx].tecido && (
                          <tr className="text-neutral-700 font-medium border-t border-neutral-200">
                            <td className="pr-1 py-0.5">Tecido</td>
                            <td className="px-1 py-0.5 text-right whitespace-nowrap text-neutral-400">{formatQtd(resultPorIdx[idx].tecido!.quantidade)} × {formatBRL(resultPorIdx[idx].tecido!.preco)}</td>
                            <td className="pl-1 py-0.5 text-right font-mono whitespace-nowrap">{formatBRL(resultPorIdx[idx].tecido!.subtotal)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-neutral-200 flex justify-end">
              <button
                type="button"
                className="btn btn-default btn-xs text-primary flex items-center gap-1.5"
                onClick={() => duplicarItem(idx)}
                title="Duplicar este item"
              >
                <FontAwesomeIcon icon={faCopy} /> Duplicar Item
              </button>
            </div>
          </div>
          );
        })}

        <button type="button" className="btn btn-default w-full" onClick={adicionarItem}>
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
