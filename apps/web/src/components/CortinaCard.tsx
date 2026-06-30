// apps/web/src/components/CortinaCard.tsx
// Uma cortina (ambiente) do orçamento — modelo "+" do Victor, agora com MODELO POR
// CAMADA (Victor v.4.1: frente wave + fundo franzido). Cada camada tem seu modelo +
// tecido + franzido; a fixação é única da cortina (válida para todos os modelos das
// camadas). Itens obrigatórios do wave são resolvidos pelo servidor (sem seleção).

import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { TecidoSearch } from './TecidoSearch';
import { BuscaSelect } from './BuscaSelect';
import { MedidaInput } from './MedidaInput';
import { formatBRL, formatNum } from '../lib/formatacao';
import type { TecidoOpcao, TipoInstalacao } from '../lib/calcTypes';
import type { CortinaCardSnap } from '../lib/rascunhoLocal';
import {
  MODELOS_CORTINA, FIXACOES_CORTINA, FIXACOES_POR_MODELO,
  type ModeloCortina, type FixacaoCortina, type AcessoriosCortinaResp,
  type CalcCortinaCompletaResp, type CategoriaAcessorio,
} from '../lib/cortinaTypes';

export interface CortinaResumo {
  total: number;
  completo: boolean;
  payload: {
    ambiente: string;
    modelo: ModeloCortina; // = modelo da 1ª camada (compat)
    fixacao: FixacaoCortina;
    largura: number;
    altura: number;
    tamanho_barra?: number;
    tipo_barra?: 'simples' | 'dupla';
    camadas: { tecido_id: string; modelo: ModeloCortina; franzido?: number }[];
    acessorios: { item: string; categoria: CategoriaAcessorio | null; produto_id: string; quantidade: number; preco: number }[];
    nome_produto: string;
    ja_possui_varao?: boolean;
    instalacao_id?: string | null;
  } | null;
}

interface CamadaState { id: string; tecidoId: string; modelo: ModeloCortina | ''; franzido: string; }

const novaCamada = (modelo: ModeloCortina | '' = ''): CamadaState => ({ id: crypto.randomUUID(), tecidoId: '', modelo, franzido: '' });

// Itens obrigatórios do wave: o produto é resolvido na tela (sem seletor), casando pelo
// nome dentro do grupo WAVE já carregado. Espelha o WAVE_FIXO_KEYWORD do backend.
const WAVE_KW: Record<string, RegExp> = {
  'Cordão wave': /cord[ãa]o/i,
  'Rodízio wave': /rod[íi]zio/i,
  'Base click': /base\s*click/i,
  'Fita wave': /fita/i,
};

/** Código curto do tecido p/ o nome do produto (espelha o tecidoCurto do backend). */
function tecidoCurto(nome: string): string {
  const m = nome.match(/\bTEX[-\s]?\d{2,4}\b/i);
  if (m) return m[0].toUpperCase().replace(/\s+/, '-');
  const base = nome.split(/\s+LARGURA|\s+L:|\s+COMPOSI/i)[0].trim();
  return base.length > 28 ? `${base.slice(0, 28).trim()}…` : base;
}

/** Entrada inicial de uma cortina (para reabrir um rascunho em edição) = payload salvo. */
export type CortinaInicial = NonNullable<CortinaResumo['payload']>;

/** Fixações permitidas para um conjunto de modelos = interseção das permitidas de cada um. */
function fixacoesComuns(modelos: ModeloCortina[]): FixacaoCortina[] {
  if (modelos.length === 0) return FIXACOES_CORTINA.map((f) => f.value);
  return FIXACOES_CORTINA.map((f) => f.value).filter((f) => modelos.every((m) => FIXACOES_POR_MODELO[m].includes(f)));
}

export function CortinaCard({
  indice, tecidos, opcoes, instalacoes, inicial, restauro, onChange, onRemover, podeRemover, onPreenchidoChange, onSnapshot,
}: {
  indice: number;
  tecidos: TecidoOpcao[];
  opcoes: AcessoriosCortinaResp | null;
  instalacoes: TipoInstalacao[];
  inicial?: CortinaInicial;
  restauro?: CortinaCardSnap;
  onChange: (resumo: CortinaResumo) => void;
  onRemover: () => void;
  podeRemover: boolean;
  onPreenchidoChange?: (preenchido: boolean) => void;
  onSnapshot?: (snap: CortinaCardSnap) => void;
}) {
  // Modelo da camada: restauro/inicial por camada; fallback ao modelo único antigo (compat).
  const modeloCamadaInicial = (i: number): ModeloCortina | '' =>
    (restauro?.camadas?.[i]?.modelo as ModeloCortina | '') ??
    (inicial?.camadas?.[i] as { modelo?: ModeloCortina } | undefined)?.modelo ??
    inicial?.modelo ?? '';

  const [ambiente, setAmbiente] = useState(restauro?.ambiente ?? inicial?.ambiente ?? '');
  const [fixacao, setFixacao] = useState<FixacaoCortina>((restauro?.fixacao as FixacaoCortina) ?? inicial?.fixacao ?? 'varao');
  const [largura, setLargura] = useState(restauro?.largura ?? (inicial ? String(inicial.largura) : ''));
  const [altura, setAltura] = useState(restauro?.altura ?? (inicial ? String(inicial.altura) : ''));
  const [tamanhoBarra, setTamanhoBarra] = useState(restauro?.tamanhoBarra ?? (inicial?.tamanho_barra != null ? String(inicial.tamanho_barra * 100) : ''));
  const [tipoBarra, setTipoBarra] = useState<'simples' | 'dupla' | ''>((restauro?.tipoBarra as 'simples' | 'dupla' | '') ?? inicial?.tipo_barra ?? '');
  const [jaPossuiVarao, setJaPossuiVarao] = useState<boolean>(restauro?.jaPossuiVarao ?? inicial?.ja_possui_varao ?? false);
  const [camadas, setCamadas] = useState<CamadaState[]>(() => {
    const base = restauro?.camadas?.length ? restauro.camadas : inicial?.camadas;
    if (base && base.length > 0) {
      return base.map((c, i) => ({
        id: crypto.randomUUID(),
        tecidoId: (c as { tecidoId?: string; tecido_id?: string }).tecidoId ?? (c as { tecido_id?: string }).tecido_id ?? '',
        modelo: modeloCamadaInicial(i),
        franzido: (c as { franzido?: number | string }).franzido != null ? String((c as { franzido?: number | string }).franzido) : '',
      }));
    }
    return [novaCamada()];
  });
  const [acessorioSel, setAcessorioSel] = useState<Record<string, string>>(
    restauro?.acessorioSel ?? (inicial ? Object.fromEntries(inicial.acessorios.map((a) => [a.item, a.produto_id])) : {}),
  );
  const [qtdManual, setQtdManual] = useState<Record<string, string>>(
    restauro?.qtdManual ?? (inicial ? Object.fromEntries(inicial.acessorios.map((a) => [a.item, String(a.quantidade)])) : {}),
  );
  const [instalacaoId, setInstalacaoId] = useState<string>(restauro?.instalacaoId ?? inicial?.instalacao_id ?? '');

  const [calc, setCalc] = useState<CalcCortinaCompletaResp | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Modelos escolhidos nas camadas → fixações comuns. Ajusta a fixação se ficar inválida.
  const modelosSelecionados = camadas.map((c) => c.modelo).filter((m): m is ModeloCortina => m !== '');
  const fixacoesPermitidas = fixacoesComuns(modelosSelecionados);
  useEffect(() => {
    if (modelosSelecionados.length > 0 && !fixacoesPermitidas.includes(fixacao)) {
      setFixacao(fixacoesPermitidas[0] ?? 'varao');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(modelosSelecionados)]);

  const fixacoesDisponiveis = FIXACOES_CORTINA.filter((f) => fixacoesPermitidas.includes(f.value));
  const modeloPrincipal = camadas[0]?.modelo || '';
  // Nome do item da barra conforme a fixação — para o "Já possui".
  const nomeBarra = fixacao === 'trilho' ? 'Trilho' : fixacao === 'varao_suico' ? 'Varão suíço' : 'Varão';
  const ehBarra = (item: string) => item === nomeBarra || item.startsWith(`${nomeBarra} (camada `);
  const isWaveCamada = (c: CamadaState) => c.modelo === 'wave';

  const assinatura = JSON.stringify({
    fixacao, largura, altura, tamanhoBarra, tipoBarra,
    camadas: camadas.map((c) => ({ t: c.tecidoId, m: c.modelo, f: c.modelo === 'wave' ? '' : c.franzido })),
  });

  const podeCalcular = Number(largura) > 0 && Number(altura) > 0 && camadas.length > 0
    && camadas.every((c) => c.tecidoId && c.modelo) && fixacoesPermitidas.length > 0;

  const tamanhoBarraNum = tamanhoBarra === '' ? undefined : Number(tamanhoBarra) / 100;
  const tipoBarraVal = tipoBarra || undefined;
  const franzidoDe = (c: CamadaState) => (isWaveCamada(c) || c.franzido === '' ? undefined : Number(c.franzido));

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!podeCalcular) { setCalc(null); setErro(null); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setCalculando(true); setErro(null);
      try {
        const r = await api.post<CalcCortinaCompletaResp>('/calcular/cortina/completa', {
          modelo: camadas[0]?.modelo, fixacao, largura: Number(largura), altura: Number(altura),
          tamanho_barra: tamanhoBarraNum, tipo_barra: tipoBarraVal,
          camadas: camadas.map((c) => ({ tecido_id: c.tecidoId, modelo: c.modelo, franzido: franzidoDe(c) })),
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

  const qtdDe = (item: string, auto: boolean, qtdCalc: number) => (auto ? qtdCalc : (Number(qtdManual[item]) || 0));

  const precoSelecionado = (categoria: CategoriaAcessorio | null, produtoId: string | undefined) => {
    if (!categoria || !produtoId) return 0;
    return opcoes?.acessorios[categoria]?.find((o) => o.id === produtoId)?.preco ?? 0;
  };

  // Resolve o produto fixo do wave (Cordão/Rodízio/Base click/Fita) nos acessórios já carregados.
  const resolveWave = (item: string) => {
    const re = WAVE_KW[item];
    if (!re || !opcoes) return undefined;
    return opcoes.acessorios.wave?.find((o) => re.test(o.nome));
  };

  const resumo = useMemo<CortinaResumo>(() => {
    if (!calc) return { total: 0, completo: false, payload: null };
    let total = calc.valor_tecido_total;
    let completo = true;
    const acessoriosPayload: NonNullable<CortinaResumo['payload']>['acessorios'] = [];
    for (const a of calc.acessorios) {
      if (jaPossuiVarao && ehBarra(a.item)) continue;
      const qtd = qtdDe(a.item, a.auto, a.quantidade);
      if (!a.auto && qtd <= 0) continue;
      if (a.auto_produto) {
        // Wave obrigatório: usa o produto/preço que o servidor já resolveu; se não vier
        // (ex.: JS novo + resposta antiga), cai para a resolução local pelos acessórios.
        const prodW = resolveWave(a.item);
        const preco = a.preco ?? prodW?.preco ?? 0;
        total += preco * qtd;
        acessoriosPayload.push({ item: a.item, categoria: a.categoria, produto_id: a.produto_id || prodW?.id || '', quantidade: qtd, preco });
        continue;
      }
      const sel = acessorioSel[a.item];
      const preco = precoSelecionado(a.categoria, sel);
      if (!sel || qtd <= 0) completo = false;
      total += preco * qtd;
      acessoriosPayload.push({ item: a.item, categoria: a.categoria, produto_id: sel ?? '', quantidade: qtd, preco });
    }
    // Instalação embutida (Victor 26/06/2026): soma no total e vai no payload (o servidor recalcula).
    const instSel = instalacoes.find((i) => i.id === instalacaoId);
    if (instSel) total += instSel.preco;

    // Nome (display): "AMBIENTE, Cortina MODELO1 TECIDO1 + MODELO2 TECIDO2 LxA". O servidor recalcula.
    const amb = ambiente.trim() ? `${ambiente.trim()}, ` : '';
    const corpo = calc.camadas.map((cam, i) => {
      const m = camadas[i]?.modelo;
      const ml = MODELOS_CORTINA.find((x) => x.value === m)?.label ?? '';
      return `${ml} ${tecidoCurto(cam.tecido.nome)}`;
    }).join(' + ');
    const nomeProduto = `${amb}Cortina ${corpo} ${formatNum(Number(largura))}x${formatNum(Number(altura))}`;
    return {
      total: Math.round(total * 100) / 100,
      completo,
      payload: {
        ambiente, modelo: (camadas[0]?.modelo || 'franzido') as ModeloCortina, fixacao, largura: Number(largura), altura: Number(altura),
        tamanho_barra: tamanhoBarraNum, tipo_barra: tipoBarraVal,
        camadas: camadas.map((c) => ({ tecido_id: c.tecidoId, modelo: (c.modelo || 'franzido') as ModeloCortina, franzido: franzidoDe(c) })),
        acessorios: acessoriosPayload, nome_produto: nomeProduto, ja_possui_varao: jaPossuiVarao,
        instalacao_id: instalacaoId || null,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, opcoes, acessorioSel, qtdManual, ambiente, fixacao, largura, altura, jaPossuiVarao, nomeBarra, instalacaoId, instalacoes, JSON.stringify(camadas.map((c) => c.modelo))]);

  useEffect(() => { onChange(resumo); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resumo]);

  const preenchido = ambiente !== '' || largura !== '' || altura !== '' ||
    tamanhoBarra !== '' || tipoBarra !== '' || camadas.some((c) => c.tecidoId || c.franzido || c.modelo) ||
    Object.keys(acessorioSel).length > 0 || Object.values(qtdManual).some((v) => v !== '');
  useEffect(() => { onPreenchidoChange?.(preenchido); }, [preenchido, onPreenchidoChange]);

  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  useEffect(() => {
    onSnapshotRef.current?.({
      ambiente, modelo: modeloPrincipal, fixacao, largura, altura, tamanhoBarra, tipoBarra, jaPossuiVarao,
      camadas: camadas.map((c) => ({ tecidoId: c.tecidoId, franzido: c.franzido, modelo: c.modelo })),
      acessorioSel, qtdManual, instalacaoId,
    });
  }, [ambiente, modeloPrincipal, fixacao, largura, altura, tamanhoBarra, tipoBarra, jaPossuiVarao, camadas, acessorioSel, qtdManual, instalacaoId]);

  const setCamada = (id: string, patch: Partial<CamadaState>) =>
    setCamadas((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="badge badge-secondary">Cortina {indice + 1}</span>
          {calc && calc.n_camadas > 1 && <span className="badge" style={{ background: 'var(--neutral-200)' }}>{calc.n_camadas} camadas</span>}
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
          <label className="form-label">Largura (m)<span className="label-required">*</span></label>
          <MedidaInput value={largura} onChange={setLargura} />
        </div>
        <div>
          <label className="form-label">Altura (m)<span className="label-required">*</span></label>
          <MedidaInput value={altura} onChange={setAltura} />
        </div>
        <div>
          <label className="form-label">Fixação<span className="label-required">*</span></label>
          <select className="input" value={fixacao} disabled={modelosSelecionados.length === 0} onChange={(e) => setFixacao(e.target.value as FixacaoCortina)}>
            {modelosSelecionados.length === 0 && <option value="">Escolha o modelo</option>}
            {fixacoesDisponiveis.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          {modelosSelecionados.length > 0 && fixacoesDisponiveis.length === 0 && (
            <div className="helper-error">Os modelos escolhidos não têm uma fixação em comum.</div>
          )}
        </div>
        <div>
          <label className="form-label">Tamanho da barra (cm)</label>
          <input type="number" className="input" min={0} step={1} value={tamanhoBarra} onChange={(e) => setTamanhoBarra(e.target.value)} placeholder="" />
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

      <label className="flex items-center gap-2 text-sm-ui mb-3">
        <input type="checkbox" checked={jaPossuiVarao} onChange={(e) => setJaPossuiVarao(e.target.checked)} style={{ accentColor: 'var(--action-add)' }} />
        Cliente já possui o {nomeBarra.toLowerCase()} (não incluir no orçamento)
      </label>

      {/* Instalação embutida no preço (Victor 26/06/2026): tipo por cortina */}
      <div className="mb-3">
        <label className="form-label">Instalação</label>
        <select className="input" value={instalacaoId} onChange={(e) => setInstalacaoId(e.target.value)}>
          <option value="">Sem instalação</option>
          {instalacoes.map((i) => <option key={i.id} value={i.id}>{i.nome} — {formatBRL(i.preco)}</option>)}
        </select>
      </div>

      {/* Camadas (cada uma com MODELO + tecido + franzido próprios) */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="form-label mb-0">Camadas (modelo + tecido)<span className="label-required">*</span></label>
          {camadas.length < 3 && (
            <button type="button" className="btn btn-default btn-xs" onClick={() => setCamadas((cs) => [...cs, novaCamada()])}>
              <FontAwesomeIcon icon={faPlus} /> Adicionar tecido
            </button>
          )}
        </div>
        <div className="space-y-2">
          {camadas.map((c, i) => (
            <div key={c.id} className="rounded-sm border border-neutral-300 p-2" style={{ background: 'var(--neutral-50)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xs-ui font-bold text-neutral-600">{i === 0 ? 'Frente' : `Camada ${i + 1}`}</span>
                {camadas.length > 1 && (
                  <button type="button" className="text-error hover:opacity-80 text-2xs-ui flex items-center gap-1" onClick={() => setCamadas((cs) => cs.filter((x) => x.id !== c.id))} title="Remover tecido">
                    <FontAwesomeIcon icon={faTrash} /> Remover
                  </button>
                )}
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <span className="text-2xs-ui text-neutral-500">Modelo<span className="label-required">*</span></span>
                  <select className="input" value={c.modelo} onChange={(e) => setCamada(c.id, { modelo: e.target.value as ModeloCortina | '' })}>
                    <option value="">Selecione…</option>
                    {MODELOS_CORTINA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className={isWaveCamada(c) ? 'col-span-8' : 'col-span-5'}>
                  <span className="text-2xs-ui text-neutral-500">Tecido<span className="label-required">*</span></span>
                  <TecidoSearch tecidos={tecidos} value={c.tecidoId} onChange={(v) => setCamada(c.id, { tecidoId: v })} placeholder="Buscar tecido…" />
                </div>
                {!isWaveCamada(c) && (
                  <div className="col-span-3">
                    <span className="text-2xs-ui text-neutral-500">Franzido</span>
                    <input type="number" className="input" min={1} step={0.1} value={c.franzido} placeholder="" onChange={(e) => setCamada(c.id, { franzido: e.target.value })} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {erro && <div className="helper-error mb-2">{erro}</div>}

      {/* Tecido — memória de cálculo */}
      {calc && (
        <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-2">
          <div className="text-xs-ui font-bold text-neutral-600 mb-2">Tecido (cálculo)</div>
          <div className="space-y-1">
            {calc.camadas.map((cam, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs-ui">
                <div className="col-span-6 text-neutral-700">{i === 0 ? 'Frente' : `Camada ${i + 1}`}: {cam.tecido.nome}</div>
                <div className="col-span-3 font-mono tabular-nums text-right text-neutral-600">
                  {formatNum(cam.metragem, 2)} m{cam.metodo === 'emenda' ? ' (emenda)' : ''}
                </div>
                <div className="col-span-3 font-mono tabular-nums text-right text-neutral-800">{formatBRL(cam.valor_tecido)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acessórios */}
      {calc && (
        <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3">
          <div className="text-xs-ui font-bold text-neutral-600 mb-2">Acessórios<span className="label-required">*</span> <span className="font-normal text-neutral-400">(escolha o produto dos itens com seletor)</span></div>
          <div className="space-y-2">
            {calc.acessorios.map((a) => {
              if (jaPossuiVarao && ehBarra(a.item)) {
                return (
                  <div key={a.item} className="grid grid-cols-12 gap-2 items-center text-xs-ui text-neutral-400">
                    <div className="col-span-5">{a.item}</div>
                    <div className="col-span-7 text-right italic">Cliente já possui — não incluído</div>
                  </div>
                );
              }
              const qtd = qtdDe(a.item, a.auto, a.quantidade);
              // Item obrigatório do wave: produto resolvido pelo servidor (sem seletor).
              if (a.auto_produto) {
                const prodW = resolveWave(a.item);
                const nomeW = a.produto_nome || prodW?.nome;
                const precoW = a.preco ?? prodW?.preco ?? 0;
                return (
                  <div key={a.item} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4 text-xs-ui text-neutral-700">{a.item}</div>
                    <div className="col-span-2 text-xs-ui font-mono tabular-nums text-neutral-600 text-right pr-1">{formatNum(qtd, a.unidade === 'un' ? 0 : 2)} {a.unidade}</div>
                    <div className="col-span-4 text-xs-ui text-neutral-500 italic truncate" title={nomeW}>{nomeW || 'automático'}</div>
                    <div className="col-span-2 text-xs-ui font-mono tabular-nums text-right text-neutral-800">{formatBRL(precoW * qtd)}</div>
                  </div>
                );
              }
              const opts = a.categoria && opcoes ? (opcoes.acessorios[a.categoria] ?? []) : [];
              const sel = acessorioSel[a.item] ?? '';
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
                        onChange={(e) => setQtdManual((m) => ({ ...m, [a.item]: e.target.value }))} />
                    )}
                  </div>
                  <div className="col-span-4">
                    <BuscaSelect
                      options={opts}
                      value={sel}
                      onChange={(id) => setAcessorioSel((s) => ({ ...s, [a.item]: id }))}
                      disabled={!opcoes}
                      placeholder={opcoes ? 'Buscar acessório…' : 'carregando opções…'}
                      ariaLabel={`Buscar acessório ${a.item}`}
                      compact
                    />
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
