// apps/web/src/components/CortinaCard.tsx
// Uma cortina (ambiente) do orçamento — modelo "+" do Victor, agora com MODELO POR
// CAMADA (Victor v.4.1: frente wave + fundo franzido). Cada camada tem seu modelo +
// tecido + franzido; a fixação é única da cortina (válida para todos os modelos das
// camadas). Itens obrigatórios do wave são resolvidos pelo servidor (sem seleção).

import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faSpinner, faCircleInfo, faCopy, faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { getCacheado } from '../lib/dadosCache';
import { TecidoSearch } from './TecidoSearch';
import { BuscaSelect } from './BuscaSelect';
import { MedidaInput } from './MedidaInput';
import { formatBRL, formatNum } from '../lib/formatacao';
import type { TecidoOpcao, TipoInstalacao, CalculadoraCortina } from '../lib/calcTypes';
import type { CortinaCardSnap } from '../lib/rascunhoLocal';
import {
  MODELOS_CORTINA, MODELOS_CAMADA_SECUNDARIA, FIXACOES_CORTINA, FIXACOES_POR_MODELO, DESCONTOS_CORTINA,
  modeloCortinaParaOpcao, normalizarModeloCortina,
  type ModeloCortina, type ModeloCortinaOpcao, type QuantidadeCosturadoJunto, type FixacaoCortina, type DescontoCortina, type AcessoriosCortinaResp,
  type CalcCortinaCompletaResp, type CategoriaAcessorio, type MetodoAlturaCortina,
} from '../lib/cortinaTypes';

export interface CortinaResumo {
  total: number;
  completo: boolean;
  payload: {
    ambiente: string;
    modelo: ModeloCortina; // = modelo da 1ª camada (compat)
    fixacao: FixacaoCortina;
    desconto?: DescontoCortina;
    largura: number;
    altura: number;
    modelo_cortina_nome?: string;
    tamanho_barra?: number;
    tipo_barra?: 'simples' | 'dupla';
    aberturas?: number;
    bainhas_laterais?: number;
    camadas: { nome?: string; tecido_id: string; modelo: ModeloCortinaOpcao; franzido?: number; metodo_altura?: MetodoAlturaCortina; costurado_quantidade?: QuantidadeCosturadoJunto }[];
    acessorios: { item: string; categoria: CategoriaAcessorio | null; produto_id: string; quantidade: number; preco: number }[];
    nome_produto: string;
    ja_possui_varao?: boolean;
    instalacao_id?: string | null;
  } | null;
}

interface CamadaState { id: string; nome: string; tecidoId: string; modelo: ModeloCortinaOpcao | ''; franzido: string; metodoAltura: MetodoAlturaCortina; costuradoQuantidade: QuantidadeCosturadoJunto; }

const nomePadraoCamada = (index: number): string => (index === 0 ? 'Frente' : `Camada ${index + 1}`);
const novaCamada = (modelo: ModeloCortinaOpcao | '' = '', index = 0): CamadaState => ({ id: crypto.randomUUID(), nome: nomePadraoCamada(index), tecidoId: '', modelo, franzido: '', metodoAltura: 'emenda', costuradoQuantidade: 'mesma_quantidade' });
const calcCache = new Map<string, { expiraEm: number; valor: CalcCortinaCompletaResp }>();
const calcEmVoo = new Map<string, Promise<CalcCortinaCompletaResp>>();

function postCalculoCortinaCacheado(key: string, payload: unknown): Promise<CalcCortinaCompletaResp> {
  const cached = calcCache.get(key);
  if (cached && Date.now() <= cached.expiraEm) return Promise.resolve(cached.valor);
  const emVoo = calcEmVoo.get(key);
  if (emVoo) return emVoo;
  const req = api.post<CalcCortinaCompletaResp>('/calcular/cortina/completa', payload)
    .then((valor) => {
      calcCache.set(key, { expiraEm: Date.now() + 2 * 60 * 1000, valor });
      return valor;
    })
    .finally(() => calcEmVoo.delete(key));
  calcEmVoo.set(key, req);
  return req;
}

// Itens obrigatórios do wave: o produto é resolvido na tela (sem seletor), casando pelo
// nome dentro do grupo WAVE já carregado. Espelha o WAVE_FIXO_KEYWORD do backend.
const WAVE_KW: Record<string, RegExp> = {
  'Cordão wave': /cord[ãa]o/i,
  'Rodízio wave': /rod[íi]zio/i,
  'Base click': /base\s*click/i,
  'Fita wave': /fita/i,
};

/** Entrada inicial de uma cortina (para reabrir um rascunho em edição) = payload salvo. */
export type CortinaInicial = NonNullable<CortinaResumo['payload']>;

/** Fixações permitidas para um conjunto de modelos = interseção das permitidas de cada um. */
function fixacoesComuns(modelos: ModeloCortinaOpcao[]): FixacaoCortina[] {
  const modelosComFixacao = modelos.filter((m) => m !== 'costurado_junto');
  if (modelosComFixacao.length === 0) return FIXACOES_CORTINA.map((f) => f.value);
  return FIXACOES_CORTINA.map((f) => f.value).filter((f) => modelosComFixacao.every((m) => FIXACOES_POR_MODELO[normalizarModeloCortina(m)].includes(f)));
}

/**
 * Envia o modelo da camada como o vendedor escolheu, inclusive a variante de
 * prega (Americana/Macho/Fêmea): o cálculo é o mesmo, mas o nome precisa chegar
 * à ficha do produto no GestãoClick. O servidor normaliza para o motor.
 */
function modeloCamadaPayload(modelo: ModeloCortinaOpcao | ''): ModeloCortinaOpcao | undefined {
  return modelo || undefined;
}

export function CortinaCard({
  indice, tecidos, opcoes, instalacoes, inicial, restauro, onChange, onRemover, podeRemover, onPreenchidoChange, onSnapshot, onDuplicar,
  onCalculandoChange,
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
  onDuplicar?: () => void;
  onCalculandoChange?: (calculando: boolean) => void;
}) {
  // Modelo da camada: restauro/inicial por camada; fallback ao modelo único antigo (compat).
  const modeloCamadaInicial = (i: number): ModeloCortinaOpcao | '' =>
    modeloCortinaParaOpcao(
      restauro?.camadas?.[i]?.modelo ??
        (inicial?.camadas?.[i] as { modelo?: string } | undefined)?.modelo ??
        inicial?.modelo,
    );

  const [ambiente, setAmbiente] = useState(restauro?.ambiente ?? inicial?.ambiente ?? '');
  const [fixacao, setFixacao] = useState<FixacaoCortina>((restauro?.fixacao as FixacaoCortina) ?? inicial?.fixacao ?? 'varao');
  const [desconto, setDesconto] = useState<DescontoCortina>((restauro?.desconto as DescontoCortina | undefined) ?? (inicial as { desconto?: DescontoCortina } | undefined)?.desconto ?? 'sem_desconto');
  const [largura, setLargura] = useState(restauro?.largura ?? (inicial ? String(inicial.largura) : ''));
  const [altura, setAltura] = useState(restauro?.altura ?? (inicial ? String(inicial.altura) : ''));
  const [tamanhoBarra, setTamanhoBarra] = useState(restauro?.tamanhoBarra ?? (inicial?.tamanho_barra != null ? String(inicial.tamanho_barra * 100) : ''));
  const [tipoBarra, setTipoBarra] = useState<'simples' | 'dupla' | ''>((restauro?.tipoBarra as 'simples' | 'dupla' | '') ?? inicial?.tipo_barra ?? '');
  const [aberturas, setAberturas] = useState<string>(restauro?.aberturas ?? (inicial?.aberturas != null ? String(inicial.aberturas) : ''));
  const [bainhasLaterais, setBainhasLaterais] = useState<string>(restauro?.bainhasLaterais ?? (inicial?.bainhas_laterais != null ? String(inicial.bainhas_laterais * 100) : ''));
  const [jaPossuiVarao, setJaPossuiVarao] = useState<boolean>(restauro?.jaPossuiVarao ?? inicial?.ja_possui_varao ?? false);
  const [camadas, setCamadas] = useState<CamadaState[]>(() => {
    const base = restauro?.camadas?.length ? restauro.camadas : inicial?.camadas;
    if (base && base.length > 0) {
      return base.map((c, i) => ({
        id: crypto.randomUUID(),
        nome: (c as { nome?: string }).nome ?? nomePadraoCamada(i),
        tecidoId: (c as { tecidoId?: string; tecido_id?: string }).tecidoId ?? (c as { tecido_id?: string }).tecido_id ?? '',
        modelo: modeloCamadaInicial(i),
        franzido: (c as { franzido?: number | string }).franzido != null ? String((c as { franzido?: number | string }).franzido) : '',
        metodoAltura: ((c as { metodoAltura?: MetodoAlturaCortina; metodo_altura?: MetodoAlturaCortina }).metodoAltura ?? (c as { metodo_altura?: MetodoAlturaCortina }).metodo_altura ?? 'emenda'),
        costuradoQuantidade: ((c as { costuradoQuantidade?: QuantidadeCosturadoJunto; costurado_quantidade?: QuantidadeCosturadoJunto }).costuradoQuantidade ?? (c as { costurado_quantidade?: QuantidadeCosturadoJunto }).costurado_quantidade ?? 'mesma_quantidade'),
      }));
    }
    return [novaCamada()];
  });
  const [calculadoras, setCalculadoras] = useState<CalculadoraCortina[]>([]);
  const [modeloCortinaId, setModeloCortinaId] = useState<string>('');
  const [modeloCortinaNome, setModeloCortinaNome] = useState<string>(restauro?.modeloCortinaNome ?? inicial?.modelo_cortina_nome ?? '');

  useEffect(() => {
    getCacheado<{ calculadoras: CalculadoraCortina[] }>('cortina-calculadoras-v2', '/calcular/calculadoras-cortina')
      .then((r) => setCalculadoras(r.calculadoras))
      .catch(() => setCalculadoras([]));
  }, []);

  const aoMudarModeloCortina = (id: string) => {
    setModeloCortinaId(id);
    if (!id) {
      setModeloCortinaNome('');
      return;
    }
    const calc = calculadoras.find((c) => c.id === id);
    if (!calc) return;
    setModeloCortinaNome(calc.nome);
    
    setFixacao(calc.fixacao_default as FixacaoCortina);
    setTamanhoBarra(calc.tamanho_barra_default != null ? String(calc.tamanho_barra_default * 100) : '');
    setTipoBarra(calc.tipo_barra_default || '');
    setAberturas(calc.aberturas_default != null ? String(calc.aberturas_default) : '');
    setBainhasLaterais(calc.bainhas_laterais_default != null ? String(calc.bainhas_laterais_default * 100) : '');
    
    const novasCamadas = calc.camadas.map((cam, i) => ({
      id: crypto.randomUUID(),
      nome: cam.nome || nomePadraoCamada(i),
      tecidoId: '',
      modelo: modeloCortinaParaOpcao(cam.modelo_default),
      franzido: cam.franzido_default != null ? String(cam.franzido_default) : '',
      metodoAltura: 'emenda' as MetodoAlturaCortina,
      costuradoQuantidade: 'mesma_quantidade' as QuantidadeCosturadoJunto,
    }));
    setCamadas(novasCamadas);
  };

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
  const [minimizado, setMinimizado] = useState(false);

  // Modelos escolhidos nas camadas → fixações comuns. Ajusta a fixação se ficar inválida.
  const modelosSelecionados = camadas.map((c) => c.modelo).filter((m): m is ModeloCortinaOpcao => m !== '');
  const fixacoesPermitidas = fixacoesComuns(modelosSelecionados);
  useEffect(() => {
    if (modelosSelecionados.length > 0 && !fixacoesPermitidas.includes(fixacao)) {
      setFixacao(fixacoesPermitidas[0] ?? 'varao');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(modelosSelecionados)]);

  const fixacoesDisponiveis = FIXACOES_CORTINA.filter((f) => fixacoesPermitidas.includes(f.value));
  const descontosDisponiveis = DESCONTOS_CORTINA.filter((d) => !d.fixacoes || d.fixacoes.includes(fixacao));
  useEffect(() => {
    if (!descontosDisponiveis.some((d) => d.value === desconto)) {
      setDesconto('sem_desconto');
    }
  }, [fixacao, desconto, descontosDisponiveis]);
  const modeloPrincipal = camadas[0]?.modelo || '';
  // Nome do item da barra conforme a fixação — para o "Já possui".
  const nomeBarra = fixacao === 'trilho' ? 'Trilho' : fixacao === 'varao_suico' ? 'Varão suíço' : 'Varão';
  const ehBarra = (item: string) => item === nomeBarra || item.startsWith(`${nomeBarra} (camada `);
  const isWaveCamada = (c: CamadaState) => c.modelo !== '' && c.modelo !== 'costurado_junto' && normalizarModeloCortina(c.modelo) === 'wave';

  const obterFormulaAcessorio = (item: string) => {
    const L = Number(largura) || 0;
    const frente = calc?.camadas[0];
    const consumoFrente = frente?.consumo || 0;
    const metragemFrente = frente?.metragem || 0;
    const metragemSemBainhas = metragemFrente - (frente?.bainhas_laterais_acrescimo || 0);
    const metodo = frente?.metodo || 'normal';
    
    if (item === 'Trilho' || item === 'Varão' || item === 'Varão suíço' || item.startsWith('Trilho (') || item.startsWith('Varão (')) {
      return `Largura real da cortina: ${formatNum(L, 2)} m`;
    }
    if (item === 'Cordão wave') {
      const botoes = Math.ceil(L / 0.06 + 1);
      const botoesArr = Math.ceil(botoes / 4) * 4;
      const vaos = botoesArr - 1;
      return `(Quantidade de botões [${botoesArr}] - 1) × 0,06 m = ${formatNum(vaos * 0.06, 2)} m`;
    }
    if (item === 'Rodízio wave' || item === 'Base click') {
      return `Largura [${formatNum(L, 2)} m] / 0,06 + 1, arredondado para cima ao múltiplo de 4`;
    }
    if (item === 'Fita wave' || item === 'Entretela (KOS)') {
      if (metodo === 'emenda') {
        return `Largura franzida (consumo): ${formatNum(consumoFrente, 2)} m`;
      }
      if (metodo === 'barra_postica') {
        return `Barra postiça, antes das bainhas laterais: ${formatNum(metragemSemBainhas, 2)} m`;
      }
      return `Sem emenda, antes das bainhas laterais: ${formatNum(metragemSemBainhas, 2)} m`;
    }
    if (item === 'Ilhoses') {
      return `Largura franzida [${formatNum(consumoFrente, 2)} m] / 0,15, arredondado para cima até o próximo par ou múltiplo de 4`;
    }
    if (item === 'Argolas' || item === 'Rodízios/ganchos' || item.includes('traseiro')) {
      return `Largura [${formatNum(L, 2)} m] / 0,10, arredondado para o próximo par`;
    }
    if (item.includes('Ponteira')) {
      return 'Padrão: 2 unidades por face de varão';
    }
    if (item === 'Terminais') {
      return 'Padrão: 4 unidades por trilho ou varão suíço';
    }
    if (item.includes('Suporte')) {
      return 'Definido manualmente conforme necessidade de instalação';
    }
    return '';
  };

  const assinatura = JSON.stringify({
    fixacao, desconto, largura, altura, tamanhoBarra, tipoBarra, aberturas, bainhasLaterais,
    camadas: camadas.map((c) => ({ t: c.tecidoId, m: c.modelo, f: c.modelo === 'costurado_junto' && c.costuradoQuantidade === 'mesma_quantidade' ? '' : c.franzido, ma: c.metodoAltura, cq: c.modelo === 'costurado_junto' ? c.costuradoQuantidade : '' })),
  });

  const podeCalcular = Number(largura) > 0 && Number(altura) > 0 && camadas.length > 0
    && camadas.every((c) => c.tecidoId && c.modelo) && fixacoesPermitidas.length > 0;

  const tamanhoBarraNum = tamanhoBarra === '' ? undefined : Number(tamanhoBarra) / 100;
  const tipoBarraVal = tipoBarra || undefined;
  const franzidoDe = (c: CamadaState) => (c.franzido === '' ? undefined : Number(c.franzido));
  // Sem o modelo no nome (espelha nomeProdutoCortina no servidor): o modelo de
  // cada camada já aparece na descrição, com a prega específica.
  const nomeProdutoPreview = ['Cortina', ambiente.trim()].filter(Boolean).join(' ') + ` L:${formatNum(Number(largura), 2)}m X A:${formatNum(Number(altura), 2)}m`;

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqCalc = useRef(0);
  useEffect(() => {
    seqCalc.current += 1;
    const seq = seqCalc.current;
    if (!podeCalcular) {
      setCalculando(false);
      onCalculandoChange?.(false);
      setCalc(null);
      setErro(null);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    setCalculando(true);
    onCalculandoChange?.(true);
    debounce.current = setTimeout(async () => {
      setErro(null);
      const payload = {
        modelo: camadas[0]?.modelo ? normalizarModeloCortina(camadas[0].modelo) : undefined, fixacao, desconto, largura: Number(largura), altura: Number(altura),
        tamanho_barra: tamanhoBarraNum, tipo_barra: tipoBarraVal,
        aberturas: aberturas === '' ? undefined : Number(aberturas),
        bainhas_laterais: bainhasLaterais === '' ? undefined : Number(bainhasLaterais) / 100,
        camadas: camadas.map((c) => ({ nome: c.nome.trim() || undefined, tecido_id: c.tecidoId, modelo: modeloCamadaPayload(c.modelo), franzido: franzidoDe(c), metodo_altura: c.metodoAltura, ...(c.modelo === 'costurado_junto' ? { costurado_quantidade: c.costuradoQuantidade } : {}) })),
      };
      try {
        const r = await postCalculoCortinaCacheado(assinatura, payload);
        if (seq !== seqCalc.current) return;
        setCalc(r);
      } catch (e) {
        if (seq !== seqCalc.current) return;
        setCalc(null);
        setErro(e instanceof ApiError ? e.message : 'Falha ao calcular.');
      } finally {
        if (seq !== seqCalc.current) return;
        setCalculando(false);
        onCalculandoChange?.(false);
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

    // Nome curto; o servidor recalcula e envia os detalhes técnicos na descrição.
    return {
      total: Math.round(total * 100) / 100,
      completo,
      payload: {
        ambiente, modelo: camadas[0]?.modelo ? normalizarModeloCortina(camadas[0].modelo) : 'franzido', fixacao, desconto, largura: Number(largura), altura: Number(altura),
        modelo_cortina_nome: modeloCortinaNome || undefined,
        tamanho_barra: tamanhoBarraNum, tipo_barra: tipoBarraVal,
        aberturas: aberturas === '' ? undefined : Number(aberturas),
        bainhas_laterais: bainhasLaterais === '' ? undefined : Number(bainhasLaterais) / 100,
        camadas: camadas.map((c) => ({ nome: c.nome.trim() || undefined, tecido_id: c.tecidoId, modelo: modeloCamadaPayload(c.modelo) ?? 'franzido', franzido: franzidoDe(c), metodo_altura: c.metodoAltura, ...(c.modelo === 'costurado_junto' ? { costurado_quantidade: c.costuradoQuantidade } : {}) })),
        acessorios: acessoriosPayload, nome_produto: nomeProdutoPreview, ja_possui_varao: jaPossuiVarao,
        instalacao_id: instalacaoId || null,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, opcoes, acessorioSel, qtdManual, ambiente, fixacao, desconto, largura, altura, tamanhoBarra, tipoBarra, aberturas, bainhasLaterais, jaPossuiVarao, nomeBarra, instalacaoId, instalacoes, nomeProdutoPreview, JSON.stringify(camadas.map((c) => ({ nome: c.nome, modelo: c.modelo, metodoAltura: c.metodoAltura, costuradoQuantidade: c.costuradoQuantidade })))]);

  useEffect(() => { onChange(resumo); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resumo]);

  const preenchido = ambiente !== '' || largura !== '' || altura !== '' || desconto !== 'sem_desconto' ||
    tamanhoBarra !== '' || tipoBarra !== '' || aberturas !== '' || bainhasLaterais !== '' || camadas.some((c) => c.tecidoId || c.franzido || c.modelo) ||
    Object.keys(acessorioSel).length > 0 || Object.values(qtdManual).some((v) => v !== '');
  useEffect(() => { onPreenchidoChange?.(preenchido); }, [preenchido, onPreenchidoChange]);

  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  useEffect(() => {
    onSnapshotRef.current?.({
      ambiente, modelo: modeloPrincipal, fixacao, desconto, largura, altura, tamanhoBarra, tipoBarra, aberturas, bainhasLaterais, jaPossuiVarao,
      modeloCortinaNome,
      camadas: camadas.map((c) => ({ nome: c.nome, tecidoId: c.tecidoId, franzido: c.franzido, modelo: c.modelo, metodoAltura: c.metodoAltura, costuradoQuantidade: c.costuradoQuantidade })),
      acessorioSel, qtdManual, instalacaoId,
    });
  }, [ambiente, modeloPrincipal, fixacao, desconto, largura, altura, tamanhoBarra, tipoBarra, aberturas, bainhasLaterais, jaPossuiVarao, modeloCortinaNome, camadas, acessorioSel, qtdManual, instalacaoId]);

  const setCamada = (id: string, patch: Partial<CamadaState>) =>
    setCamadas((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const duplicarEColapsar = () => {
    setMinimizado(true);
    onDuplicar?.();
  };

  return (
    <div className="card p-4">
      <div className={`flex items-center justify-between ${minimizado ? 'mb-0' : 'mb-3'}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2 pr-3">
          <button
            type="button"
            className="btn btn-default btn-xs"
            onClick={() => setMinimizado((v) => !v)}
            aria-expanded={!minimizado}
            title={minimizado ? 'Expandir cortina' : 'Minimizar cortina'}
          >
            <FontAwesomeIcon icon={minimizado ? faChevronRight : faChevronDown} />
          </button>
          <span className="badge badge-secondary">Cortina {indice + 1}</span>
          <span className="truncate text-sm-ui font-semibold text-neutral-800" title={nomeProdutoPreview}>{nomeProdutoPreview}</span>
          {calc && calc.n_camadas > 1 && <span className="badge" style={{ background: 'var(--neutral-200)' }}>{calc.n_camadas} camadas</span>}
          {calculando && <FontAwesomeIcon icon={faSpinner} spin className="text-neutral-400" />}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {minimizado && (
            <span className="font-mono tabular-nums text-xs-ui font-semibold text-neutral-800">
              {calculando ? 'Calculando...' : formatBRL(resumo.total)}
            </span>
          )}
          {minimizado && onDuplicar && (
            <button type="button" className="text-primary hover:opacity-80 text-xs-ui flex items-center gap-1" onClick={duplicarEColapsar} title="Duplicar cortina">
              <FontAwesomeIcon icon={faCopy} /> Duplicar
            </button>
          )}
          {podeRemover && (
            <button type="button" className="text-error hover:opacity-80 text-xs-ui flex items-center gap-1" onClick={onRemover} title="Remover cortina">
              <FontAwesomeIcon icon={faTrash} /> Remover
            </button>
          )}
        </div>
      </div>

      {minimizado ? null : (
        <>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2 md:col-span-1">
          <label className="form-label" htmlFor={`ambiente-cortina-${indice}`}>Ambiente</label>
          <input id={`ambiente-cortina-${indice}`} className="input" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Ex.: Sala, Quarto 1…" />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="form-label" htmlFor={`modelo-cortina-${indice}`}>Modelo de Cortina</label>
          <select id={`modelo-cortina-${indice}`} className="input" value={modeloCortinaId} onChange={(e) => aoMudarModeloCortina(e.target.value)}>
            <option value="">Selecione um modelo...</option>
            {calculadoras.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor={`largura-cortina-${indice}`}>Largura (m)<span className="label-required">*</span></label>
          <MedidaInput id={`largura-cortina-${indice}`} value={largura} onChange={setLargura} />
        </div>
        <div>
          <label className="form-label" htmlFor={`altura-cortina-${indice}`}>Altura (m)<span className="label-required">*</span></label>
          <MedidaInput id={`altura-cortina-${indice}`} value={altura} onChange={setAltura} />
        </div>
        <div>
          <label className="form-label" htmlFor={`fixacao-cortina-${indice}`}>Fixação<span className="label-required">*</span></label>
          <select id={`fixacao-cortina-${indice}`} className="input" value={fixacao} disabled={modelosSelecionados.length === 0} onChange={(e) => setFixacao(e.target.value as FixacaoCortina)}>
            {modelosSelecionados.length === 0 && <option value="">Escolha o modelo</option>}
            {fixacoesDisponiveis.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          {modelosSelecionados.length > 0 && fixacoesDisponiveis.length === 0 && (
            <div className="helper-error">Os modelos escolhidos não têm uma fixação em comum.</div>
          )}
        </div>
        <div>
          <label className="form-label" htmlFor={`tamanho-barra-cortina-${indice}`}>Tamanho da barra (cm)</label>
          <input id={`tamanho-barra-cortina-${indice}`} type="number" className="input" min={0} step={1} value={tamanhoBarra} onChange={(e) => setTamanhoBarra(e.target.value)} placeholder="" />
        </div>
        <div>
          <label className="form-label" htmlFor={`tipo-barra-cortina-${indice}`}>Tipo de barra</label>
          <select id={`tipo-barra-cortina-${indice}`} className="input" value={tipoBarra} onChange={(e) => setTipoBarra(e.target.value as 'simples' | 'dupla' | '')}>
            <option value="">Selecione…</option>
            <option value="simples">Simples</option>
            <option value="dupla">Dupla</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor={`desconto-cortina-${indice}`}>Desconto</label>
          <select id={`desconto-cortina-${indice}`} className="input" value={desconto} onChange={(e) => setDesconto(e.target.value as DescontoCortina)}>
            {descontosDisponiveis.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor={`abertura-cortina-${indice}`}>Tipo de abertura</label>
          <select id={`abertura-cortina-${indice}`} className="input" value={aberturas} onChange={(e) => setAberturas(e.target.value)}>
            <option value="">Selecione…</option>
            <option value="2">Central</option>
            <option value="1">Sem abertura</option>
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
            <button type="button" className="btn btn-default btn-xs" onClick={() => setCamadas((cs) => [...cs, novaCamada('', cs.length)])}>
              <FontAwesomeIcon icon={faPlus} /> Adicionar tecido
            </button>
          )}
        </div>
        <div className="space-y-2">
          {camadas.map((c, i) => {
            const calcCamada = calc?.camadas[i];
            const pedeMetodoAltura = calcCamada?.altura_excede_tecido === true;
            return (
              <div key={c.id} className="rounded-sm border border-neutral-300 p-2" style={{ background: 'var(--neutral-50)' }}>
                <div className="flex items-center justify-between mb-1">
                  <input
                    className="input font-bold text-neutral-700"
                    style={{ height: 26, width: 180, maxWidth: '70%', fontSize: 11, padding: '2px 6px' }}
                    value={c.nome}
                    onChange={(e) => setCamada(c.id, { nome: e.target.value })}
                    placeholder={nomePadraoCamada(i)}
                    aria-label={`Nome da camada ${i + 1}`}
                  />
                  {camadas.length > 1 && (
                    <button type="button" className="text-error hover:opacity-80 text-2xs-ui flex items-center gap-1" onClick={() => setCamadas((cs) => cs.filter((x) => x.id !== c.id))} title="Remover tecido">
                      <FontAwesomeIcon icon={faTrash} /> Remover
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <span className="text-2xs-ui text-neutral-500">Tipo de Confecção<span className="label-required">*</span></span>
                    <select
                      className="input"
                      value={c.modelo}
                      onChange={(e) => {
                        const modelo = e.target.value as ModeloCortinaOpcao | '';
                        setCamada(c.id, {
                          modelo,
                          ...(modelo === 'costurado_junto' ? { metodoAltura: 'emenda', costuradoQuantidade: c.costuradoQuantidade ?? 'mesma_quantidade' } : {}),
                        });
                      }}
                    >
                      <option value="">Selecione…</option>
                      {(i === 0 ? MODELOS_CORTINA : MODELOS_CAMADA_SECUNDARIA).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className={isWaveCamada(c) ? 'col-span-8' : 'col-span-5'}>
                    <span className="text-2xs-ui text-neutral-500">Tecido<span className="label-required">*</span></span>
                    <TecidoSearch tecidos={tecidos} value={c.tecidoId} onChange={(v) => setCamada(c.id, { tecidoId: v })} placeholder="Buscar tecido…" />
                  </div>
                  {!isWaveCamada(c) && !(c.modelo === 'costurado_junto' && c.costuradoQuantidade === 'mesma_quantidade') && (
                    <div className="col-span-3">
                      <span className="text-2xs-ui text-neutral-500">Franzido</span>
                      <input type="number" className="input" min={1} step={0.1} value={c.franzido} placeholder="" onChange={(e) => setCamada(c.id, { franzido: e.target.value })} />
                    </div>
                  )}
                  {c.modelo === 'costurado_junto' && (
                    <div className="col-span-12 md:col-span-4">
                      <span className="text-2xs-ui text-neutral-500">Quantidade de tecido</span>
                      <select className="input" value={c.costuradoQuantidade} onChange={(e) => setCamada(c.id, { costuradoQuantidade: e.target.value as QuantidadeCosturadoJunto })}>
                        <option value="mesma_quantidade">Mesma quantidade da frente</option>
                        <option value="proporcao_franzido">Proporção do franzido</option>
                      </select>
                    </div>
                  )}
                  {pedeMetodoAltura && (
                    <div className="col-span-12 md:col-span-4">
                      <span className="text-2xs-ui text-neutral-500">Método de cálculo</span>
                      <select className="input" value={c.metodoAltura} onChange={(e) => setCamada(c.id, { metodoAltura: e.target.value as MetodoAlturaCortina })}>
                        <option value="emenda">Emenda</option>
                        <option value="barra_postica">Barra postiça</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {erro && <div className="helper-error mb-2">{erro}</div>}

      {/* Tecido — memória de cálculo */}
      {calc && (
        <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-2">
          <div className="text-xs-ui font-bold text-neutral-600 mb-2">Tecido (cálculo)</div>
          <div className="space-y-1">
            {calc.camadas.map((cam, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs-ui border-b border-neutral-100 py-1 last:border-b-0">
                <div className="col-span-6 text-neutral-700">{camadas[i]?.nome.trim() || nomePadraoCamada(i)}: {cam.tecido.nome}</div>
                <div className="col-span-3 font-mono tabular-nums text-right text-neutral-600">
                  {formatNum(cam.metragem, 2)} m{cam.costurado_junto ? ' (costurado junto)' : cam.metodo === 'emenda' ? ' (emenda)' : cam.metodo === 'barra_postica' ? ' (barra postiça)' : ''}
                </div>
                <div className="col-span-3 font-mono tabular-nums text-right text-neutral-800">{formatBRL(cam.valor_tecido)}</div>
                {cam.bainhas_laterais_acrescimo > 0 && (
                  <div className="col-span-12 text-neutral-600 text-2xs-ui mt-1 bg-neutral-100 border border-neutral-200 rounded-sm px-2 py-1">
                    Bainhas laterais: <strong>+{formatNum(cam.bainhas_laterais_acrescimo, 2)} m</strong> de tecido nesta camada.
                  </div>
                )}
                {cam.costurado_junto && (
                  <div className="col-span-12 text-neutral-500 text-2xs-ui mt-1 pl-2 border-l-2 border-primary flex items-center gap-1.5 bg-neutral-100 p-1 rounded-sm">
                    <FontAwesomeIcon icon={faCircleInfo} className="text-primary" style={{ fontSize: 10 }} />
                    <span>
                      Costurado junto: calcula somente o tecido, sem acessórios. Quantidade: <strong>{cam.costurado_quantidade === 'proporcao_franzido' ? 'proporção do franzido' : 'mesma quantidade da frente'}</strong>.
                    </span>
                  </div>
                )}
                {!cam.costurado_junto && cam.metodo === 'emenda' && cam.tiras && (
                  <div className="col-span-12 text-neutral-500 text-2xs-ui mt-1 pl-2 border-l-2 border-primary flex items-center gap-1.5 bg-neutral-100 p-1 rounded-sm">
                    <FontAwesomeIcon icon={faCircleInfo} className="text-primary" style={{ fontSize: 10 }} />
                    <span>
                      Cálculo de Emenda: <strong>{cam.tiras} faixas</strong> de <strong>{(Number(altura) + cam.barra_consumo).toFixed(2).replace('.', ',')} m</strong> (altura {Number(altura).toFixed(2).replace('.', ',')} m + {cam.barra_consumo.toFixed(2).replace('.', ',')} m folga/barra)
                    </span>
                  </div>
                )}
                {!cam.costurado_junto && cam.metodo === 'barra_postica' && cam.barra_postica_base !== null && cam.barra_postica_acrescimo !== null && (
                  <div className="col-span-12 text-neutral-500 text-2xs-ui mt-1 pl-2 border-l-2 border-primary flex items-center gap-1.5 bg-neutral-100 p-1 rounded-sm">
                    <FontAwesomeIcon icon={faCircleInfo} className="text-primary" style={{ fontSize: 10 }} />
                    <span>
                      Barra postiça: <strong>{formatNum(cam.barra_postica_base, 2)} m</strong> + <strong>{formatNum(cam.barra_postica_acrescimo, 2)} m</strong> = <strong>{formatNum(cam.metragem, 2)} m</strong>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acessórios */}
      {calc && (
        <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3">
          <div className="text-xs-ui font-bold text-neutral-600 mb-2">Acessórios<span className="label-required">*</span> <span className="font-normal text-neutral-500">(escolha o produto dos itens com seletor)</span></div>
          <div className="space-y-2">
            {calc.acessorios.map((a) => {
              if (jaPossuiVarao && ehBarra(a.item)) {
                return (
                  <div key={a.item} className="grid grid-cols-12 gap-2 items-center text-xs-ui text-neutral-500 py-1 border-b border-neutral-100 last:border-0">
                    <div className="col-span-5">{a.item}</div>
                    <div className="col-span-7 text-right italic">Cliente já possui — não incluído</div>
                  </div>
                );
              }
              const qtd = qtdDe(a.item, a.auto, a.quantidade);
              const formulaText = obterFormulaAcessorio(a.item);
              
              // Item obrigatório do wave: produto resolvido pelo servidor (sem seletor).
              if (a.auto_produto) {
                const prodW = resolveWave(a.item);
                const nomeW = a.produto_nome || prodW?.nome;
                const precoW = a.preco ?? prodW?.preco ?? 0;
                return (
                  <div key={a.item} className="border-b border-neutral-100 py-1.5 last:border-0">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4 text-xs-ui text-neutral-700">{a.item}</div>
                      <div className="col-span-2 text-xs-ui font-mono tabular-nums text-neutral-600 text-right pr-1">{formatNum(qtd, a.unidade === 'un' ? 0 : 2)} {a.unidade}</div>
                      <div className="col-span-4 text-xs-ui text-neutral-500 italic truncate" title={nomeW}>{nomeW || 'automático'}</div>
                      <div className="col-span-2 text-xs-ui font-mono tabular-nums text-right text-neutral-800">{formatBRL(precoW * qtd)}</div>
                    </div>
                    {formulaText && (
                      <div className="text-neutral-500 text-3xs-ui pl-4 mt-0.5 border-l border-neutral-200">
                        Cálculo: {formulaText}
                      </div>
                    )}
                  </div>
                );
              }
              const opts = a.categoria && opcoes ? (opcoes.acessorios[a.categoria] ?? []) : [];
              const sel = acessorioSel[a.item] ?? '';
              const preco = precoSelecionado(a.categoria, sel);
              return (
                <div key={a.item} className="border-b border-neutral-100 py-1.5 last:border-0">
                  <div className="grid grid-cols-12 gap-2 items-center">
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
                  {formulaText && (
                    <div className="text-neutral-500 text-3xs-ui pl-4 mt-0.5 border-l border-neutral-200">
                      Cálculo: {formulaText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {onDuplicar && (
        <div className="mt-4 pt-3 border-t border-neutral-200 flex justify-end">
          <button type="button" className="btn btn-default btn-sm text-primary flex items-center gap-1.5" onClick={duplicarEColapsar} title="Duplicar esta cortina">
            <FontAwesomeIcon icon={faCopy} /> Duplicar Cortina
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
