// apps/web/src/components/CortinaCard.tsx
// Uma cortina (ambiente) do orçamento de cortina — modelo "+" do Victor:
// ambiente + modelo + fixação + medidas + 1–3 tecidos (camadas via "+") + seletores
// de acessório (produto por grupo do GestãoClick). Calcula via /cortina/completa e
// reporta o resumo (total + se está completo + payload) ao container.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { TecidoSearch } from './TecidoSearch';
import { MedidaInput } from './MedidaInput';
import { formatBRL, formatNum } from '../lib/formatacao';
import type { TecidoOpcao } from '../lib/calcTypes';
import {
  MODELOS_CORTINA, FIXACOES_CORTINA, FIXACOES_POR_MODELO, TIPO_POR_CAMADAS,
  type ModeloCortina, type FixacaoCortina, type AcessoriosCortinaResp,
  type CalcCortinaCompletaResp, type CategoriaAcessorio,
} from '../lib/cortinaTypes';

export interface CortinaResumo {
  total: number;
  completo: boolean;
  // dados para o envio ao GC (Fase 8 — etapa 4)
  payload: {
    ambiente: string;
    modelo: ModeloCortina;
    fixacao: FixacaoCortina;
    largura: number;
    altura: number;
    tamanho_barra?: number;
    tipo_barra?: 'simples' | 'dupla';
    camadas: { tecido_id: string; franzido?: number }[];
    acessorios: { item: string; categoria: CategoriaAcessorio | null; produto_id: string; quantidade: number; preco: number }[];
    nome_produto: string;
  } | null;
}

interface CamadaState { id: string; tecidoId: string; franzido: string; }

const novaCamada = (): CamadaState => ({ id: crypto.randomUUID(), tecidoId: '', franzido: '' });

export function CortinaCard({
  indice, tecidos, opcoes, onChange, onRemover, podeRemover,
}: {
  indice: number;
  tecidos: TecidoOpcao[];
  opcoes: AcessoriosCortinaResp | null; // null enquanto carrega em segundo plano
  onChange: (resumo: CortinaResumo) => void;
  onRemover: () => void;
  podeRemover: boolean;
}) {
  const [ambiente, setAmbiente] = useState('');
  const [modelo, setModelo] = useState<ModeloCortina | ''>('');
  const [fixacao, setFixacao] = useState<FixacaoCortina>('varao');
  const [largura, setLargura] = useState('');
  const [altura, setAltura] = useState('');
  const [tamanhoBarra, setTamanhoBarra] = useState(''); // vazio = padrão 0,10 m no servidor
  const [tipoBarra, setTipoBarra] = useState<'simples' | 'dupla' | ''>('');
  const [camadas, setCamadas] = useState<CamadaState[]>([novaCamada()]);
  const [acessorioSel, setAcessorioSel] = useState<Record<string, string>>({}); // categoria → produto_id
  const [qtdManual, setQtdManual] = useState<Record<string, number>>({}); // item → qtd (não-auto, ex.: suporte)

  const [calc, setCalc] = useState<CalcCortinaCompletaResp | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Ao escolher/trocar o modelo, ajusta a fixação para uma permitida.
  useEffect(() => {
    if (!modelo) return;
    const permitidas = FIXACOES_POR_MODELO[modelo];
    if (!permitidas.includes(fixacao)) setFixacao(permitidas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo]);

  const fixacoesDisponiveis = modelo ? FIXACOES_CORTINA.filter((f) => FIXACOES_POR_MODELO[modelo].includes(f.value)) : [];
  const isWave = modelo === 'wave';

  // Assinatura das entradas que afetam o cálculo (dispara o recálculo, com debounce).
  const camadasValidas = camadas.filter((c) => c.tecidoId);
  const assinatura = JSON.stringify({
    modelo, fixacao, largura, altura, tamanhoBarra, tipoBarra,
    camadas: camadas.map((c) => ({ t: c.tecidoId, f: isWave ? '' : c.franzido })),
  });

  const podeCalcular = modelo !== '' && Number(largura) > 0 && Number(altura) > 0 && camadasValidas.length > 0
    && camadas.every((c) => c.tecidoId);

  // Campos de barra/franzido vazios → undefined (servidor usa o padrão).
  const tamanhoBarraNum = tamanhoBarra === '' ? undefined : Number(tamanhoBarra);
  const tipoBarraVal = tipoBarra || undefined;
  const franzidoDe = (c: CamadaState) => (isWave || c.franzido === '' ? undefined : Number(c.franzido));

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!podeCalcular) { setCalc(null); setErro(null); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setCalculando(true); setErro(null);
      try {
        const r = await api.post<CalcCortinaCompletaResp>('/calcular/cortina/completa', {
          modelo, fixacao, largura: Number(largura), altura: Number(altura),
          tamanho_barra: tamanhoBarraNum, tipo_barra: tipoBarraVal,
          camadas: camadas.map((c) => ({ tecido_id: c.tecidoId, franzido: franzidoDe(c) })),
        });
        setCalc(r);
      } catch (e) {
        setCalc(null);
        setErro(e instanceof ApiError ? e.message : 'Falha ao calcular.');
      } finally {
        setCalculando(false);
      }
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, podeCalcular]);

  // Quantidade efetiva de um item (auto = do motor; manual = digitada pelo vendedor).
  const qtdDe = (item: string, auto: boolean, qtdCalc: number) => (auto ? qtdCalc : (qtdManual[item] ?? 0));

  // Preço do produto escolhido numa categoria.
  const precoSelecionado = (categoria: CategoriaAcessorio | null, produtoId: string | undefined) => {
    if (!categoria || !produtoId) return 0;
    return opcoes?.acessorios[categoria]?.find((o) => o.id === produtoId)?.preco ?? 0;
  };

  // Total da cortina + se está completo (todos os acessórios com produto escolhido).
  const resumo = useMemo<CortinaResumo>(() => {
    if (!calc) return { total: 0, completo: false, payload: null };
    let total = calc.valor_tecido_total;
    let completo = true;
    const acessoriosPayload: NonNullable<CortinaResumo['payload']>['acessorios'] = [];
    for (const a of calc.acessorios) {
      const sel = a.categoria ? acessorioSel[a.categoria] : undefined;
      const preco = precoSelecionado(a.categoria, sel);
      const qtd = qtdDe(a.item, a.auto, a.quantidade);
      if (!sel || qtd <= 0) completo = false;
      total += preco * qtd;
      acessoriosPayload.push({ item: a.item, categoria: a.categoria, produto_id: sel ?? '', quantidade: qtd, preco });
    }
    const tecidoNome = calc.camadas[0]?.tecido.nome ?? '';
    const tipo = TIPO_POR_CAMADAS[calc.n_camadas] ?? '';
    const nomeProduto = `${MODELOS_CORTINA.find((m) => m.value === modelo)?.label ?? modelo}${tipo ? ` ${tipo}` : ''} • ${tecidoNome} • ${formatNum(Number(largura))}×${formatNum(Number(altura))}m`;
    return {
      total: Math.round(total * 100) / 100,
      completo,
      payload: {
        ambiente, modelo: modelo as ModeloCortina, fixacao, largura: Number(largura), altura: Number(altura),
        tamanho_barra: tamanhoBarraNum, tipo_barra: tipoBarraVal,
        camadas: camadas.map((c) => ({ tecido_id: c.tecidoId, franzido: franzidoDe(c) })),
        acessorios: acessoriosPayload, nome_produto: nomeProduto,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, acessorioSel, qtdManual, ambiente, modelo, fixacao, largura, altura]);

  // Reporta o resumo ao container sempre que mudar.
  useEffect(() => { onChange(resumo); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resumo]);

  const setCamada = (id: string, patch: Partial<CamadaState>) =>
    setCamadas((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="badge badge-secondary">Cortina {indice + 1}</span>
          {calc && <span className="badge" style={{ background: 'var(--neutral-200)' }}>{TIPO_POR_CAMADAS[calc.n_camadas]}</span>}
          {calculando && <FontAwesomeIcon icon={faSpinner} spin className="text-neutral-400" />}
        </div>
        {podeRemover && (
          <button type="button" className="text-error hover:opacity-80 text-xs-ui flex items-center gap-1" onClick={onRemover} title="Remover cortina">
            <FontAwesomeIcon icon={faTrash} /> Remover
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="form-label">Ambiente</label>
          <input className="input" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Ex.: Sala, Quarto 1…" />
        </div>
        <div>
          <label className="form-label">Modelo<span className="label-required">*</span></label>
          <select className="input" value={modelo} onChange={(e) => setModelo(e.target.value as ModeloCortina | '')}>
            <option value="">Selecione…</option>
            {MODELOS_CORTINA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Fixação<span className="label-required">*</span></label>
          <select className="input" value={fixacao} disabled={!modelo} onChange={(e) => setFixacao(e.target.value as FixacaoCortina)}>
            {!modelo && <option value="">—</option>}
            {fixacoesDisponiveis.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Largura (m)<span className="label-required">*</span></label>
          <MedidaInput value={largura} onChange={setLargura} />
        </div>
        <div>
          <label className="form-label">Altura (m)<span className="label-required">*</span></label>
          <MedidaInput value={altura} onChange={setAltura} />
        </div>
        <div>
          <label className="form-label">Tamanho da barra (m)</label>
          <input type="number" className="input" min={0} step={0.01} value={tamanhoBarra} onChange={(e) => setTamanhoBarra(e.target.value)} placeholder="0,10" />
        </div>
        <div>
          <label className="form-label">Tipo de barra</label>
          <select className="input" value={tipoBarra} onChange={(e) => setTipoBarra(e.target.value as 'simples' | 'dupla' | '')}>
            <option value="">Selecione…</option>
            <option value="simples">Simples</option>
            <option value="dupla">Dupla</option>
          </select>
        </div>
      </div>

      {/* Camadas (tecidos) */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="form-label mb-0">Tecidos (camadas)<span className="label-required">*</span></label>
          {camadas.length < 3 && (
            <button type="button" className="btn btn-default btn-xs" onClick={() => setCamadas((cs) => [...cs, novaCamada()])}>
              <FontAwesomeIcon icon={faPlus} /> Tecido
            </button>
          )}
        </div>
        <div className="space-y-2">
          {camadas.map((c, i) => (
            <div key={c.id} className="flex gap-2 items-end">
              <div className="flex-1">
                <span className="text-2xs-ui text-neutral-500">{i === 0 ? 'Frente' : `Camada ${i + 1}`}</span>
                <TecidoSearch tecidos={tecidos} value={c.tecidoId} onChange={(v) => setCamada(c.id, { tecidoId: v })} placeholder="Buscar tecido…" />
              </div>
              {!isWave && (
                <div style={{ width: 90 }}>
                  <span className="text-2xs-ui text-neutral-500">Franzido</span>
                  <input type="number" className="input" min={1} step={0.1} value={c.franzido} placeholder="3" onChange={(e) => setCamada(c.id, { franzido: e.target.value })} />
                </div>
              )}
              {camadas.length > 1 && (
                <button type="button" className="btn btn-danger btn-xs mb-1" onClick={() => setCamadas((cs) => cs.filter((x) => x.id !== c.id))} title="Remover tecido">
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {erro && <div className="helper-error mb-2">{erro}</div>}

      {/* Acessórios (vendedor escolhe o produto de cada grupo) */}
      {calc && (
        <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3">
          <div className="text-xs-ui font-bold text-neutral-600 mb-2">Acessórios</div>
          <div className="space-y-2">
            {calc.acessorios.map((a) => {
              const opts = a.categoria && opcoes ? (opcoes.acessorios[a.categoria] ?? []) : [];
              const sel = a.categoria ? acessorioSel[a.categoria] ?? '' : '';
              const qtd = qtdDe(a.item, a.auto, a.quantidade);
              const preco = precoSelecionado(a.categoria, sel);
              return (
                <div key={a.item} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 text-xs-ui text-neutral-700">{a.item}</div>
                  <div className="col-span-2">
                    {a.auto ? (
                      <div className="text-xs-ui font-mono tabular-nums text-neutral-600 text-right pr-1">
                        {formatNum(qtd, a.unidade === 'un' ? 0 : 2)} {a.unidade}
                      </div>
                    ) : (
                      <input type="number" className="input" style={{ height: 30, fontSize: 12 }} min={0} step={1}
                        value={qtdManual[a.item] ?? ''} placeholder="qtd"
                        onChange={(e) => setQtdManual((m) => ({ ...m, [a.item]: Number(e.target.value) }))} />
                    )}
                  </div>
                  <div className="col-span-4">
                    <select className="input" style={{ height: 30, fontSize: 12 }} value={sel} disabled={!opcoes}
                      onChange={(e) => a.categoria && setAcessorioSel((s) => ({ ...s, [a.categoria!]: e.target.value }))}>
                      <option value="">{opcoes ? '(escolher)' : 'carregando opções…'}</option>
                      {opts.map((o) => <option key={o.id} value={o.id}>{o.nome} — {formatBRL(o.preco)}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 text-xs-ui font-mono tabular-nums text-right text-neutral-800">
                    {formatBRL(preco * qtd)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
