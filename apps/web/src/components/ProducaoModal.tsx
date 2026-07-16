import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faFilePdf, faTag } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import type { ItemSnapshot, OrcamentoListItem } from '../lib/orcamentoTypes';
import { useAuth } from '../hooks/useAuth';
import { EtiquetaPreviewModal, type EtiquetaPreviewOrdem } from './EtiquetaPreviewModal';
import { DESCONTOS_CORTINA, type DescontoCortina, type FixacaoCortina } from '../lib/cortinaTypes';

interface OrdemProducao {
  id: string;
  codigo: string;
  item_index: number;
  gc_pedido_codigo: string;
  tipo_produto?: 'persiana' | 'cortina' | 'misto';
  status: 'criada' | 'impressa' | 'cancelada';
  item_snapshot_json?: ItemSnapshot;
}

interface ItemProducao {
  index: number;
  item: ItemSnapshot;
  ordem: OrdemProducao | null;
}

interface ProducaoPayload {
  orcamento: OrcamentoListItem & {
    ajuste_medicao_gerado?: boolean;
    medicao_absorcao?: MedicaoAbsorcao | null;
  };
  itens: ItemProducao[];
}

interface MedicaoItem {
  index: number;
  largura: number;
  altura: number;
  desconto?: DescontoCortina;
  tamanho_barra?: number;
  tipo_barra?: 'simples' | 'dupla';
}

type MedidaFinal = {
  largura: string;
  altura: string;
  desconto: DescontoCortina;
  tamanhoBarra: string;
  tipoBarra: '' | 'simples' | 'dupla';
};

interface PreviaMedicao {
  valor_original: number;
  valor_conferido: number;
  diferenca: number;
  alterados: number[];
  detalhes: DetalheDiferencaMedicao[];
}

interface DetalheDiferencaMedicao {
  index: number;
  ambiente: string;
  produto: string;
  valor_vendido: number;
  valor_conferido: number;
  diferenca: number;
  largura_vendida: number;
  altura_vendida: number;
  largura_final: number;
  altura_final: number;
  desconto_vendido: string | null;
  desconto_final: string | null;
  tamanho_barra_vendida: number | null;
  tamanho_barra_final: number | null;
  tipo_barra_vendido: string | null;
  tipo_barra_final: string | null;
  alterado: boolean;
}

interface MedicaoAbsorcao {
  status: 'solicitada' | 'aprovada' | 'reprovada';
  assinatura: string;
  medicoes: MedicaoItem[];
  previa: PreviaMedicao;
  solicitado_em: string;
  decidido_em?: string;
  motivo?: string;
}

function medida(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function dinheiro(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numeroInput(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

function numeroCmInput(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100)) : '';
}

function numeroMedida(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function produtoLabel(item: ItemSnapshot): string {
  return item.nome_produto || item.tipo || 'Produto';
}

function descontoInicial(item: ItemSnapshot): DescontoCortina {
  const v = String(item.desconto ?? 'sem_desconto');
  return DESCONTOS_CORTINA.some((d) => d.value === v) ? (v as DescontoCortina) : 'sem_desconto';
}

function descontosDisponiveis(item: ItemSnapshot) {
  const fixacao = String(item.fixacao ?? '').trim() as FixacaoCortina;
  return DESCONTOS_CORTINA.filter((d) => !d.fixacoes || d.fixacoes.includes(fixacao));
}

function descontoLabel(v: string | null | undefined): string {
  return DESCONTOS_CORTINA.find((d) => d.value === v)?.label ?? 'Sem desconto';
}

function tipoBarraLabel(v: string | null | undefined): string {
  if (v === 'simples') return 'Simples';
  if (v === 'dupla') return 'Dupla';
  return 'Não informado';
}

function ehCortinaItem(item: ItemSnapshot): boolean {
  const extra = item as ItemSnapshot & { camadas?: unknown[]; fixacao?: unknown; abertura?: unknown; tamanho_barra?: unknown; tipo_barra?: unknown };
  const texto = `${item.nome_produto ?? ''} ${item.tipo ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return Boolean(extra.camadas?.length || extra.fixacao || extra.abertura || extra.tamanho_barra != null || extra.tipo_barra || texto.includes('cortina') || texto.includes('wave') || texto.includes('prega'));
}

function assinaturaMedicoes(medicoes: MedicaoItem[]): string {
  return JSON.stringify([...medicoes]
    .sort((a, b) => a.index - b.index)
    .map((m) => ({
      index: m.index,
      largura: Math.round(m.largura * 100) / 100,
      altura: Math.round(m.altura * 100) / 100,
      desconto: m.desconto ?? null,
      tamanho_barra: m.tamanho_barra != null ? Math.round(m.tamanho_barra * 100) / 100 : null,
      tipo_barra: m.tipo_barra ?? null,
    })));
}

export function ProducaoModal({
  aberto,
  orcamento,
  onFechar,
  onAtualizar,
}: {
  aberto: boolean;
  orcamento: OrcamentoListItem | null;
  onFechar: () => void;
  onAtualizar: () => void;
}) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin';
  const [dados, setDados] = useState<ProducaoPayload | null>(null);
  const [pedido, setPedido] = useState('');
  const [entrega, setEntrega] = useState('');
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [medidasFinais, setMedidasFinais] = useState<Record<number, MedidaFinal>>({});
  const [previa, setPrevia] = useState<PreviaMedicao | null>(null);
  const [diferencaAbsorvida, setDiferencaAbsorvida] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [gerandoAjuste, setGerandoAjuste] = useState(false);
  const [solicitandoAbsorcao, setSolicitandoAbsorcao] = useState(false);
  const [decidindoAbsorcao, setDecidindoAbsorcao] = useState<'aprovar' | 'reprovar' | null>(null);
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null);
  const [imprimindoId, setImprimindoId] = useState<string | null>(null);
  const [imprimindoLote, setImprimindoLote] = useState<'persiana' | 'cortina' | null>(null);
  const [previaEtiqueta, setPreviaEtiqueta] = useState<EtiquetaPreviewOrdem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function carregar() {
    if (!orcamento) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await api.get<ProducaoPayload>(`/orcamentos/${orcamento.id}/producao`);
      const medidasBase: Record<number, MedidaFinal> = Object.fromEntries(r.itens.map(({ index, item }) => [index, {
        largura: numeroInput(item.largura_m),
        altura: numeroInput(item.altura_m),
        desconto: descontoInicial(item),
        tamanhoBarra: numeroCmInput(item.tamanho_barra),
        tipoBarra: item.tipo_barra === 'simples' || item.tipo_barra === 'dupla' ? item.tipo_barra : '',
      } as MedidaFinal]));
      const absorcao = r.orcamento.medicao_absorcao;
      const medidasComSolicitacao = absorcao && absorcao.status !== 'reprovada'
        ? {
          ...medidasBase,
          ...Object.fromEntries(absorcao.medicoes.map((m) => [m.index, {
            largura: numeroInput(m.largura),
            altura: numeroInput(m.altura),
            desconto: m.desconto ?? medidasBase[m.index]?.desconto ?? 'sem_desconto',
            tamanhoBarra: m.tamanho_barra != null ? numeroCmInput(m.tamanho_barra) : medidasBase[m.index]?.tamanhoBarra ?? '',
            tipoBarra: m.tipo_barra ?? medidasBase[m.index]?.tipoBarra ?? '',
          }])),
        }
        : medidasBase;
      setDados(r);
      setPedido(r.orcamento.gc_pedido_codigo ?? '');
      setEntrega(r.orcamento.pedido_entrega_em ? r.orcamento.pedido_entrega_em.slice(0, 10) : '');
      setSelecionados(r.itens.filter((it) => !it.ordem).map((it) => it.index));
      setMedidasFinais(medidasComSolicitacao);
      setPrevia(absorcao && absorcao.status !== 'reprovada' ? absorcao.previa : null);
      setDiferencaAbsorvida(absorcao?.status === 'aprovada');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os itens.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (aberto) void carregar();
    if (!aberto) {
      setDados(null);
      setPedido('');
      setEntrega('');
      setSelecionados([]);
      setMedidasFinais({});
      setPrevia(null);
      setDiferencaAbsorvida(false);
      setErro(null);
      setSucesso(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, orcamento?.id]);

  const medicoes = useMemo<MedicaoItem[]>(() => {
    if (!dados) return [];
    return dados.itens.flatMap(({ index, item }) => {
      const final = medidasFinais[index];
      const largura = Number(final?.largura?.replace(',', '.'));
      const altura = Number(final?.altura?.replace(',', '.'));
      const desconto = final?.desconto ?? descontoInicial(item);
      const originalL = Number(item.largura_m);
      const originalA = Number(item.altura_m);
      const originalDesconto = descontoInicial(item);
      const tamanhoBarra = final?.tamanhoBarra === '' || final?.tamanhoBarra == null ? undefined : Number(final.tamanhoBarra.replace(',', '.')) / 100;
      const tipoBarra = final?.tipoBarra || undefined;
      const originalBarra = item.tamanho_barra == null ? undefined : Number(item.tamanho_barra);
      const originalTipoBarra = item.tipo_barra === 'simples' || item.tipo_barra === 'dupla' ? item.tipo_barra : undefined;
      const barraAlterada = ehCortinaItem(item) && (
        (tamanhoBarra !== undefined && Math.abs(tamanhoBarra - (originalBarra ?? 0)) >= 0.005)
        || (tamanhoBarra === undefined && originalBarra !== undefined)
        || tipoBarra !== originalTipoBarra
      );
      if (!(largura > 0) || !(altura > 0)) return [];
      if (Math.abs(largura - originalL) < 0.005 && Math.abs(altura - originalA) < 0.005 && desconto === originalDesconto && !barraAlterada) return [];
      return [{ index, largura, altura, desconto, ...(tamanhoBarra !== undefined ? { tamanho_barra: tamanhoBarra } : {}), ...(tipoBarra ? { tipo_barra: tipoBarra as 'simples' | 'dupla' } : {}) }];
    });
  }, [dados, medidasFinais]);

  const temMedidaAlterada = medicoes.length > 0;
  const temDiferencaCalculada = previa ? Math.abs(Number(previa.diferenca)) >= 0.01 : false;
  const precisaAutorizarDiferenca = temMedidaAlterada && (!previa || temDiferencaCalculada);
  const absorcaoAtual = dados?.orcamento.medicao_absorcao ?? null;
  const assinaturaAtual = assinaturaMedicoes(medicoes);
  const absorcaoPendente = absorcaoAtual?.status === 'solicitada' && absorcaoAtual.assinatura === assinaturaAtual;
  const absorcaoAprovada = absorcaoAtual?.status === 'aprovada' && absorcaoAtual.assinatura === assinaturaAtual;
  const absorcaoReprovada = absorcaoAtual?.status === 'reprovada' && absorcaoAtual.assinatura === assinaturaAtual;
  const diferencaAutorizada = !precisaAutorizarDiferenca || diferencaAbsorvida || absorcaoAprovada || Boolean(dados?.orcamento.ajuste_medicao_gerado);

  const podeGerar = useMemo(() => {
    return dados?.orcamento.status === 'enviado' && pedido.trim().length > 0 && selecionados.length > 0 && diferencaAutorizada;
  }, [dados?.orcamento.status, pedido, selecionados.length, diferencaAutorizada]);

  function tipoOrdem(ordem: OrdemProducao): 'persiana' | 'cortina' {
    const item = ordem.item_snapshot_json;
    if (ordem.tipo_produto === 'persiana') return 'persiana';
    if (ordem.tipo_produto === 'cortina') return 'cortina';
    const extra = item as (ItemSnapshot & { descricao_produto?: unknown; camadas?: unknown[]; fixacao?: unknown; abertura?: unknown; desconto?: unknown }) | undefined;
    const descricao = [
      item?.nome_produto,
      item?.tipo,
      extra?.descricao_produto,
    ].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const pareceCortina = Boolean(
      extra?.camadas?.length
      || extra?.fixacao
      || extra?.abertura
      || extra?.desconto
      || descricao.includes('cortina')
      || descricao.includes('wave')
      || descricao.includes('prega')
      || descricao.includes('ilhos')
      || descricao.includes('franzido')
    );
    return pareceCortina ? 'cortina' : 'persiana';
  }

  const totaisOrdens = useMemo(() => {
    const totais = { persiana: 0, cortina: 0 };
    dados?.itens.forEach(({ ordem }) => {
      if (!ordem) return;
      totais[tipoOrdem(ordem)] += 1;
    });
    return totais;
  }, [dados?.itens]);

  function ordemParaPrevia(ordem: OrdemProducao): EtiquetaPreviewOrdem {
    return {
      id: ordem.id,
      codigo: ordem.codigo,
      gc_pedido_codigo: ordem.gc_pedido_codigo,
      tipo_documento: tipoOrdem(ordem),
      tipo_produto: ordem.tipo_produto,
      item_snapshot_json: ordem.item_snapshot_json,
      orcamento: {
        nome_cliente: orcamento?.nome_cliente,
        pedido_entrega_em: dados?.orcamento.pedido_entrega_em ?? null,
      },
    };
  }

  if (!aberto || !orcamento) return null;

  async function salvarPedido() {
    if (!orcamento) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.put(`/orcamentos/${orcamento.id}/pedido`, { gc_pedido_codigo: pedido.trim(), pedido_entrega_em: entrega || null });
      await carregar();
      onAtualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar o pedido.');
    } finally {
      setSalvando(false);
    }
  }

  async function gerarOrdens() {
    if (!orcamento || !podeGerar) return;
    setGerando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (pedido.trim() !== dados?.orcamento.gc_pedido_codigo || entrega !== (dados?.orcamento.pedido_entrega_em?.slice(0, 10) ?? '')) {
        await api.put(`/orcamentos/${orcamento.id}/pedido`, { gc_pedido_codigo: pedido.trim(), pedido_entrega_em: entrega || null });
      }
      const r = await api.post<{ ordens: OrdemProducao[] }>(`/orcamentos/${orcamento.id}/ordens-producao`, { itens: selecionados, medicoes, absorver_diferenca: diferencaAbsorvida });
      for (const ordem of r.ordens) {
        await api.post(`/orcamentos/ordens-producao/${ordem.id}/imprimir-etiqueta`);
      }
      setSucesso(`${r.ordens.length} ordem(ns) gerada(s) e etiqueta(s) enviada(s) para impressão.`);
      await carregar();
      onAtualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao gerar as ordens ou imprimir as etiquetas.');
    } finally {
      setGerando(false);
    }
  }

  function toggle(index: number) {
    setSelecionados((prev) => prev.includes(index) ? prev.filter((v) => v !== index) : [...prev, index]);
  }

  function alterarMedida(index: number, campo: 'largura' | 'altura', valor: string) {
    setMedidasFinais((prev) => ({ ...prev, [index]: { largura: prev[index]?.largura ?? '', altura: prev[index]?.altura ?? '', desconto: prev[index]?.desconto ?? 'sem_desconto', tamanhoBarra: prev[index]?.tamanhoBarra ?? '', tipoBarra: prev[index]?.tipoBarra ?? '', [campo]: valor } }));
    setPrevia(null);
    setDiferencaAbsorvida(false);
  }

  function alterarDesconto(index: number, valor: DescontoCortina) {
    setMedidasFinais((prev) => ({ ...prev, [index]: { largura: prev[index]?.largura ?? '', altura: prev[index]?.altura ?? '', desconto: valor, tamanhoBarra: prev[index]?.tamanhoBarra ?? '', tipoBarra: prev[index]?.tipoBarra ?? '' } }));
    setPrevia(null);
    setDiferencaAbsorvida(false);
  }

  function alterarTecnicoCortina(index: number, campo: 'tamanhoBarra' | 'tipoBarra', valor: string) {
    setMedidasFinais((prev) => ({ ...prev, [index]: { largura: prev[index]?.largura ?? '', altura: prev[index]?.altura ?? '', desconto: prev[index]?.desconto ?? 'sem_desconto', tamanhoBarra: prev[index]?.tamanhoBarra ?? '', tipoBarra: prev[index]?.tipoBarra ?? '', [campo]: valor } }));
    setPrevia(null);
    setDiferencaAbsorvida(false);
  }

  function editarItemDiferenca(index: number) {
    setEditandoIndex(index);
    const linhas = Array.from(document.querySelectorAll<HTMLElement>(`[data-medicao-item="${index}"]`));
    const linhaVisivel = linhas.find((el) => el.offsetParent !== null) ?? linhas[0];
    linhaVisivel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const campos = Array.from(document.querySelectorAll<HTMLInputElement>(`[data-medicao-barra="${index}"], [data-medicao-largura="${index}"]`));
      const campoVisivel = campos.find((el) => el.offsetParent !== null) ?? campos[0];
      campoVisivel?.focus();
      campoVisivel?.select();
    }, 250);
    window.setTimeout(() => setEditandoIndex((atual) => atual === index ? null : atual), 2500);
  }

  async function recalcularMedicao() {
    if (!orcamento) return;
    setRecalculando(true);
    setErro(null);
    try {
      const r = await api.post<{ previa: PreviaMedicao }>(`/orcamentos/${orcamento.id}/producao/medicao/preview`, { medicoes });
      setPrevia(r.previa);
      setDiferencaAbsorvida(false);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao recalcular as medidas.');
    } finally {
      setRecalculando(false);
    }
  }

  async function gerarVendaAjuste() {
    if (!orcamento || !previa || !(previa.diferenca > 0)) return;
    setGerandoAjuste(true);
    setErro(null);
    setSucesso(null);
    try {
      const r = await api.post<{ venda: { gc_pedido_codigo: string | null } }>(`/orcamentos/${orcamento.id}/producao/medicao/venda-ajuste`, { medicoes });
      setSucesso(`Venda complementar criada no GestãoClick${r.venda.gc_pedido_codigo ? `: ${r.venda.gc_pedido_codigo}` : '.'}`);
      setDados((atual) => atual ? { ...atual, orcamento: { ...atual.orcamento, ajuste_medicao_gerado: true } } : atual);
      onAtualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao gerar venda complementar.');
    } finally {
      setGerandoAjuste(false);
    }
  }

  async function solicitarAbsorcao() {
    if (!orcamento || !previa || !temDiferencaCalculada) return;
    setSolicitandoAbsorcao(true);
    setErro(null);
    setSucesso(null);
    try {
      const r = await api.post<{ medicao_absorcao: MedicaoAbsorcao }>(`/orcamentos/${orcamento.id}/producao/medicao/solicitar-absorcao`, { medicoes });
      setDados((atual) => atual ? { ...atual, orcamento: { ...atual.orcamento, medicao_absorcao: r.medicao_absorcao } } : atual);
      setSucesso('Solicitação de absorção enviada para aprovação do administrador.');
      onAtualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao solicitar absorção da diferença.');
    } finally {
      setSolicitandoAbsorcao(false);
    }
  }

  async function decidirAbsorcao(acao: 'aprovar' | 'reprovar') {
    if (!orcamento) return;
    setDecidindoAbsorcao(acao);
    setErro(null);
    setSucesso(null);
    try {
      const r = await api.post<{ medicao_absorcao: MedicaoAbsorcao }>(`/orcamentos/${orcamento.id}/producao/medicao/decidir-absorcao`, { acao });
      setDados((atual) => atual ? { ...atual, orcamento: { ...atual.orcamento, medicao_absorcao: r.medicao_absorcao } } : atual);
      setDiferencaAbsorvida(r.medicao_absorcao.status === 'aprovada');
      setSucesso(r.medicao_absorcao.status === 'aprovada' ? 'Absorção aprovada. A OS está liberada.' : 'Absorção reprovada.');
      onAtualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao decidir a solicitação de absorção.');
    } finally {
      setDecidindoAbsorcao(null);
    }
  }

  function camposMedida(index: number, item: ItemSnapshot, bloqueado: boolean, ordem?: OrdemProducao | null) {
    const itemFinal = ordem?.item_snapshot_json ?? item;
    const final = bloqueado
      ? {
        largura: numeroInput(itemFinal.largura_m),
        altura: numeroInput(itemFinal.altura_m),
        desconto: descontoInicial(itemFinal),
        tamanhoBarra: numeroCmInput(itemFinal.tamanho_barra),
        tipoBarra: itemFinal.tipo_barra === 'simples' || itemFinal.tipo_barra === 'dupla' ? itemFinal.tipo_barra : '',
      }
      : (medidasFinais[index] ?? {
        largura: numeroInput(item.largura_m),
        altura: numeroInput(item.altura_m),
        desconto: descontoInicial(item),
        tamanhoBarra: numeroCmInput(item.tamanho_barra),
        tipoBarra: item.tipo_barra === 'simples' || item.tipo_barra === 'dupla' ? item.tipo_barra : '',
      });
    const opcoesDesconto = descontosDisponiveis(itemFinal);
    const itemCortina = ehCortinaItem(itemFinal);
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <input
            className="input"
            data-medicao-largura={index}
            value={final.largura}
            disabled={bloqueado}
            onChange={(e) => alterarMedida(index, 'largura', e.target.value)}
            aria-label={`Largura final item ${index + 1}`}
            inputMode="decimal"
            style={{ height: 34, padding: '6px 8px' }}
          />
          <input
            className="input"
            value={final.altura}
            disabled={bloqueado}
            onChange={(e) => alterarMedida(index, 'altura', e.target.value)}
            aria-label={`Altura final item ${index + 1}`}
            inputMode="decimal"
            style={{ height: 34, padding: '6px 8px' }}
          />
        </div>
        <select
          className="input"
          value={final.desconto}
          disabled={bloqueado}
          onChange={(e) => alterarDesconto(index, e.target.value as DescontoCortina)}
          aria-label={`Tipo de desconto da medição item ${index + 1}`}
          style={{ height: 32, padding: '5px 8px', fontSize: 12 }}
        >
          {opcoesDesconto.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        {itemCortina && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
            <div>
              <label className="text-2xs-ui text-neutral-500" htmlFor={`barra-producao-${index}`}>Barra (cm)</label>
              <input
                id={`barra-producao-${index}`}
                data-medicao-barra={index}
                className="input"
                value={final.tamanhoBarra}
                disabled={bloqueado}
                onChange={(e) => alterarTecnicoCortina(index, 'tamanhoBarra', e.target.value)}
                inputMode="decimal"
                style={{ height: 32, padding: '5px 8px', fontSize: 12 }}
              />
            </div>
            <div>
              <label className="text-2xs-ui text-neutral-500" htmlFor={`tipo-barra-producao-${index}`}>Tipo</label>
              <select
                id={`tipo-barra-producao-${index}`}
                className="input"
                value={final.tipoBarra}
                disabled={bloqueado}
                onChange={(e) => alterarTecnicoCortina(index, 'tipoBarra', e.target.value)}
                style={{ height: 32, padding: '5px 8px', fontSize: 12 }}
              >
                <option value="">Selecione...</option>
                <option value="simples">Simples</option>
                <option value="dupla">Dupla</option>
              </select>
            </div>
          </div>
        )}
      </div>
    );
  }

  function abrirPdf(id: string) {
    window.open(`/api/orcamentos/ordens-producao/${id}/pdf`, '_blank', 'noopener,noreferrer');
  }

  function abrirPdfLote(tipo: 'persiana' | 'cortina') {
    if (!orcamento) return;
    window.open(`/api/orcamentos/${orcamento.id}/ordens-producao/pdf?tipo=${tipo}`, '_blank', 'noopener,noreferrer');
  }

  async function imprimirEtiqueta(ordem: OrdemProducao) {
    setImprimindoId(ordem.id);
    setErro(null);
    setSucesso(null);
    try {
      await api.post(`/orcamentos/ordens-producao/${ordem.id}/imprimir-etiqueta`);
      setSucesso(`Etiqueta ${ordem.codigo} enviada para impressão.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao imprimir etiqueta.');
    } finally {
      setImprimindoId(null);
    }
  }

  async function imprimirEtiquetasLote(tipo: 'persiana' | 'cortina') {
    if (!orcamento) return;
    setImprimindoLote(tipo);
    setErro(null);
    setSucesso(null);
    try {
      const r = await api.post<{ quantidade: number }>(`/orcamentos/${orcamento.id}/ordens-producao/imprimir-etiquetas?tipo=${tipo}`);
      setSucesso(`${r.quantidade} etiqueta(s) de ${tipo} enviada(s) para impressão.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao imprimir etiquetas em lote.');
    } finally {
      setImprimindoLote(null);
    }
  }

  function documentos(ordem: OrdemProducao) {
    return (
      <div style={{ minWidth: 0 }}>
        <div className="font-mono text-sm-ui mb-1" style={{ overflowWrap: 'anywhere' }}>{ordem.codigo}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, width: '100%' }}>
          <button type="button" className="btn btn-info btn-xs" onClick={() => abrirPdf(ordem.id)} title="Abrir ordem de serviço em PDF">
            <FontAwesomeIcon icon={faFilePdf} /> OS
          </button>
          <button type="button" className="btn btn-info btn-xs" onClick={() => setPreviaEtiqueta(ordemParaPrevia(ordem))} title="Prévia visual da etiqueta">
            <FontAwesomeIcon icon={faEye} /> Prévia
          </button>
          <button
            type="button"
            className="btn btn-default btn-xs"
            disabled={imprimindoId === ordem.id}
            onClick={() => void imprimirEtiqueta(ordem)}
            title="Imprimir etiqueta na Zebra"
            style={{ gridColumn: '1 / -1' }}
          >
            <FontAwesomeIcon icon={faTag} /> {imprimindoId === ordem.id ? '...' : 'Etiqueta'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' }}
      onClick={onFechar}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 920, width: 'calc(100vw - 32px)', maxHeight: '88vh', overflow: 'auto', boxShadow: 'var(--shadow-modal)', zIndex: 200, boxSizing: 'border-box' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-lg-ui font-bold">Gerar Ordem de Produção</div>
            <div className="text-sm-ui text-neutral-600">
              Orçamento <span className="font-mono">{orcamento.gc_codigo ?? orcamento.gc_orcamento_id ?? '-'}</span> · {orcamento.nome_cliente}
            </div>
          </div>
          <button type="button" className="btn btn-default btn-xs" onClick={onFechar}>Fechar</button>
        </div>

        {erro && <div className="alert alert-danger mb-3">{erro}</div>}
        {sucesso && <div className="alert alert-success mb-3">{sucesso}</div>}

        {orcamento.status !== 'enviado' && (
          <div className="alert alert-warning mb-3">
            A ordem de produção só pode ser gerada para orçamentos enviados ao GestãoClick.
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div style={{ minWidth: 220, flex: '1 1 220px', maxWidth: 260 }}>
            <label className="form-label" htmlFor="pedido-producao">Nº Pedido</label>
            <input
              id="pedido-producao"
              className="input"
              value={pedido}
              disabled={orcamento.status !== 'enviado'}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="Informe o número do pedido"
            />
          </div>
          <button type="button" className="btn btn-default" disabled={salvando || orcamento.status !== 'enviado' || !pedido.trim()} onClick={salvarPedido}>
            {salvando ? 'Salvando...' : 'Salvar Pedido'}
          </button>
          <div style={{ minWidth: 180, flex: '1 1 180px', maxWidth: 220 }}>
            <label className="form-label" htmlFor="entrega-producao">Data de entrega</label>
            <input
              id="entrega-producao"
              type="date"
              className="input"
              value={entrega}
              disabled={orcamento.status !== 'enviado'}
              onChange={(e) => setEntrega(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4" style={{ border: '1px solid #dee2e6', borderRadius: 3, padding: 12, background: '#f8f9fa' }}>
          <div className="text-sm-ui font-bold mb-2">Impressão em lote</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-info btn-sm"
              disabled={totaisOrdens.persiana === 0}
              onClick={() => abrirPdfLote('persiana')}
              title="Abrir todas as OS A4 de persianas em um PDF"
            >
              <FontAwesomeIcon icon={faFilePdf} /> OS A4 persianas ({totaisOrdens.persiana})
            </button>
            <button
              type="button"
              className="btn btn-info btn-sm"
              disabled={totaisOrdens.cortina === 0}
              onClick={() => abrirPdfLote('cortina')}
              title="Abrir todas as OS A4 de cortinas em um PDF"
            >
              <FontAwesomeIcon icon={faFilePdf} /> OS A4 cortinas ({totaisOrdens.cortina})
            </button>
            <button
              type="button"
              className="btn btn-default btn-sm"
              disabled={totaisOrdens.persiana === 0 || imprimindoLote !== null}
              onClick={() => void imprimirEtiquetasLote('persiana')}
              title="Imprimir todas as etiquetas de persianas na Zebra"
            >
              <FontAwesomeIcon icon={faTag} /> {imprimindoLote === 'persiana' ? 'Imprimindo...' : `Etiquetas persianas (${totaisOrdens.persiana})`}
            </button>
            <button
              type="button"
              className="btn btn-default btn-sm"
              disabled={totaisOrdens.cortina === 0 || imprimindoLote !== null}
              onClick={() => void imprimirEtiquetasLote('cortina')}
              title="Imprimir todas as etiquetas de cortinas na Zebra"
            >
              <FontAwesomeIcon icon={faTag} /> {imprimindoLote === 'cortina' ? 'Imprimindo...' : `Etiquetas cortinas (${totaisOrdens.cortina})`}
            </button>
          </div>
        </div>

        <div className="table-scroll hidden lg:block" style={{ border: '1px solid #dee2e6', borderRadius: 3, maxWidth: '100%' }}>
          <table className="data-table" style={{ minWidth: 0, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 42 }} />
              <col style={{ width: '31%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: 128 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 190 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 42, padding: 10 }} />
                <th style={{ padding: 10, textAlign: 'left' }}>Produto</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Tecido</th>
                <th style={{ padding: 10, textAlign: 'left', width: 128 }}>Medida vendida</th>
                <th style={{ padding: 10, textAlign: 'left', width: 150 }}>Medida final</th>
                <th style={{ padding: 10, textAlign: 'left', width: 190 }}>Documentos</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={6} style={{ padding: 16 }}>Carregando itens...</td></tr>
              ) : (dados?.itens.length ?? 0) === 0 ? (
                <tr><td colSpan={6} style={{ padding: 16, color: '#6c757d' }}>Nenhum produto encontrado no orçamento.</td></tr>
              ) : (
                dados?.itens.map(({ index, item, ordem }) => (
                  <tr
                    key={index}
                    data-medicao-item={index}
                    style={{
                      borderTop: '1px solid #dee2e6',
                      background: editandoIndex === index ? '#fff3cd' : undefined,
                      transition: 'background 150ms ease',
                    }}
                  >
                    <td style={{ padding: 10 }}>
                      <input
                        type="checkbox"
                        checked={selecionados.includes(index)}
                        disabled={Boolean(ordem) || orcamento.status !== 'enviado'}
                        onChange={() => toggle(index)}
                        aria-label={`Selecionar item ${index + 1}`}
                      />
                    </td>
                    <td style={{ padding: 10 }}>
                      <div className="td-strong">{item.ambiente || `Item ${index + 1}`}</div>
                      <div className="text-sm-ui text-neutral-600" style={{ overflowWrap: 'anywhere' }}>{produtoLabel(item)}</div>
                    </td>
                    <td style={{ padding: 10, overflowWrap: 'anywhere' }} className="text-sm-ui">{item.tecido_nome}</td>
                    <td style={{ padding: 10 }} className="font-mono text-sm-ui">
                      {medida(item.largura_m)} x {medida(item.altura_m)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {camposMedida(index, item, Boolean(ordem) || orcamento.status !== 'enviado', ordem)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {ordem ? (
                        documentos(ordem)
                      ) : (
                        <span className="text-sm-ui text-neutral-500">Ainda não gerada</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden" style={{ border: '1px solid #dee2e6', borderRadius: 3 }}>
          {carregando ? (
            <div style={{ padding: 16 }}>Carregando itens...</div>
          ) : (dados?.itens.length ?? 0) === 0 ? (
            <div style={{ padding: 16, color: '#6c757d' }}>Nenhum produto encontrado no orçamento.</div>
          ) : (
            dados?.itens.map(({ index, item, ordem }) => (
              <div
                key={index}
                data-medicao-item={index}
                style={{
                  padding: 12,
                  borderTop: index === 0 ? undefined : '1px solid #dee2e6',
                  background: editandoIndex === index ? '#fff3cd' : undefined,
                  transition: 'background 150ms ease',
                }}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(index)}
                    disabled={Boolean(ordem) || orcamento.status !== 'enviado'}
                    onChange={() => toggle(index)}
                    aria-label={`Selecionar item ${index + 1}`}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="td-strong">{item.ambiente || `Item ${index + 1}`}</div>
                    <div className="text-sm-ui text-neutral-600" style={{ overflowWrap: 'anywhere' }}>{produtoLabel(item)}</div>
                    <div className="text-sm-ui mt-1" style={{ overflowWrap: 'anywhere' }}>{item.tecido_nome}</div>
                    <div className="font-mono text-sm-ui mt-1">{medida(item.largura_m)} x {medida(item.altura_m)}</div>
                    <div className="mt-2">
                      <div className="text-2xs-ui font-bold uppercase text-neutral-500 mb-1">Medida final</div>
                      {camposMedida(index, item, Boolean(ordem) || orcamento.status !== 'enviado', ordem)}
                    </div>
                    <div className="mt-2">{ordem ? documentos(ordem) : <span className="text-sm-ui text-neutral-500">Ainda não gerada</span>}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
          <button
            type="button"
            className="btn btn-default"
            disabled={orcamento.status !== 'enviado' || !dados}
            onClick={() => setSelecionados(dados?.itens.filter((it) => !it.ordem).map((it) => it.index) ?? [])}
          >
            Selecionar pendentes
          </button>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="btn btn-default" disabled={orcamento.status !== 'enviado' || recalculando || !dados} onClick={() => void recalcularMedicao()}>
              {recalculando ? 'Recalculando...' : 'Recalcular diferença'}
            </button>
            <button type="button" className="btn btn-default" onClick={onFechar}>Cancelar</button>
            <button type="button" className="btn btn-success" disabled={!podeGerar || gerando} onClick={gerarOrdens}>
              {gerando ? 'Gerando e imprimindo...' : 'Gerar OS e imprimir etiquetas'}
            </button>
          </div>
        </div>
        {previa && (
          <div className="mt-3" style={{ border: '1px solid #dee2e6', borderRadius: 3, padding: 12, background: '#f8f9fa' }}>
            <div className="flex flex-wrap justify-between gap-2">
              <span>Valor vendido: <strong>{dinheiro(previa.valor_original)}</strong></span>
              <span>Valor conferido: <strong>{dinheiro(previa.valor_conferido)}</strong></span>
              <span>Diferença: <strong className={previa.diferenca > 0 ? 'text-danger' : previa.diferenca < 0 ? 'text-success' : ''}>{dinheiro(previa.diferenca)}</strong></span>
            </div>
            {previa.detalhes.length > 0 && (
              <div className="mt-3" style={{ border: '1px solid #dee2e6', borderRadius: 3, background: '#fff', overflow: 'hidden' }}>
                <div className="text-sm-ui font-bold" style={{ padding: '8px 10px', borderBottom: '1px solid #dee2e6', background: '#f4f4f4' }}>
                  Onde a diferença apareceu
                </div>
                <div className="table-scroll hidden md:block">
                  <table className="data-table" style={{ minWidth: 820 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: 8, textAlign: 'left' }}>Item</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Medida</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Desconto</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>Vendido</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>Conferido</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>Diferença</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previa.detalhes.map((d) => (
                        <tr key={d.index} style={{ borderTop: '1px solid #dee2e6' }}>
                          <td style={{ padding: 8 }}>
                            <div className="td-strong">{d.index + 1}. {d.ambiente}</div>
                            <div className="text-xs-ui text-neutral-600" style={{ overflowWrap: 'anywhere' }}>{d.produto}</div>
                          </td>
                          <td style={{ padding: 8 }} className="font-mono text-sm-ui">
                            {numeroMedida(d.largura_vendida)} x {numeroMedida(d.altura_vendida)} → {numeroMedida(d.largura_final)} x {numeroMedida(d.altura_final)}
                          </td>
                          <td style={{ padding: 8 }} className="text-sm-ui">
                            <div>{descontoLabel(d.desconto_vendido)} → {descontoLabel(d.desconto_final)}</div>
                            {(d.tamanho_barra_vendida !== null || d.tamanho_barra_final !== null || d.tipo_barra_vendido || d.tipo_barra_final) && (
                              <div className="text-xs-ui text-neutral-600 mt-1">
                                Barra: {d.tamanho_barra_vendida !== null ? numeroMedida(d.tamanho_barra_vendida * 100) : '-'} cm → {d.tamanho_barra_final !== null ? numeroMedida(d.tamanho_barra_final * 100) : '-'} cm · {tipoBarraLabel(d.tipo_barra_vendido)} → {tipoBarraLabel(d.tipo_barra_final)}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 8, textAlign: 'right' }} className="font-mono text-sm-ui">{dinheiro(d.valor_vendido)}</td>
                          <td style={{ padding: 8, textAlign: 'right' }} className="font-mono text-sm-ui">{dinheiro(d.valor_conferido)}</td>
                          <td style={{ padding: 8, textAlign: 'right' }} className={`font-mono text-sm-ui ${d.diferenca > 0 ? 'text-danger' : d.diferenca < 0 ? 'text-success' : ''}`}>{dinheiro(d.diferenca)}</td>
                          <td style={{ padding: 8, textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-default btn-xs"
                              disabled={orcamento.status !== 'enviado'}
                              onClick={() => editarItemDiferenca(d.index)}
                              title="Editar os dados técnicos deste item"
                            >
                              Editar item
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden">
                  {previa.detalhes.map((d) => (
                    <div key={d.index} style={{ padding: 10, borderTop: d.index === previa.detalhes[0]?.index ? undefined : '1px solid #dee2e6' }}>
                      <div className="td-strong">{d.index + 1}. {d.ambiente}</div>
                      <div className="text-xs-ui text-neutral-600">{d.produto}</div>
                      <div className="font-mono text-sm-ui mt-1">{numeroMedida(d.largura_vendida)} x {numeroMedida(d.altura_vendida)} → {numeroMedida(d.largura_final)} x {numeroMedida(d.altura_final)}</div>
                      <div className="text-sm-ui mt-1">{descontoLabel(d.desconto_vendido)} → {descontoLabel(d.desconto_final)}</div>
                      {(d.tamanho_barra_vendida !== null || d.tamanho_barra_final !== null || d.tipo_barra_vendido || d.tipo_barra_final) && (
                        <div className="text-xs-ui text-neutral-600 mt-1">
                          Barra: {d.tamanho_barra_vendida !== null ? numeroMedida(d.tamanho_barra_vendida * 100) : '-'} cm → {d.tamanho_barra_final !== null ? numeroMedida(d.tamanho_barra_final * 100) : '-'} cm · {tipoBarraLabel(d.tipo_barra_vendido)} → {tipoBarraLabel(d.tipo_barra_final)}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 mt-1 text-sm-ui">
                        <span>Vendido: <strong>{dinheiro(d.valor_vendido)}</strong></span>
                        <span>Conferido: <strong>{dinheiro(d.valor_conferido)}</strong></span>
                        <span>Diferença: <strong className={d.diferenca > 0 ? 'text-danger' : d.diferenca < 0 ? 'text-success' : ''}>{dinheiro(d.diferenca)}</strong></span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-default btn-xs mt-2"
                        disabled={orcamento.status !== 'enviado'}
                        onClick={() => editarItemDiferenca(d.index)}
                        title="Editar os dados técnicos deste item"
                      >
                        Editar item
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {previa.diferenca > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <span className="text-sm-ui text-neutral-700">Para cobrar a diferença, gere uma venda complementar no GestãoClick antes ou depois de liberar a OS.</span>
                <button type="button" className="btn btn-warning btn-sm" disabled={gerandoAjuste} onClick={() => void gerarVendaAjuste()}>
                  {gerandoAjuste ? 'Gerando...' : 'Gerar venda complementar'}
                </button>
              </div>
            )}
            {Math.abs(previa.diferenca) >= 0.01 && !dados?.orcamento.ajuste_medicao_gerado && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 mt-2"
                style={{
                  border: absorcaoPendente && isAdmin ? '1px solid #f39c12' : '1px solid transparent',
                  borderRadius: 3,
                  padding: absorcaoPendente && isAdmin ? 10 : 0,
                  background: absorcaoPendente && isAdmin ? '#fff3cd' : 'transparent',
                }}
              >
                <div className="text-sm-ui text-neutral-700" style={{ maxWidth: 560 }}>
                  {absorcaoAprovada || diferencaAbsorvida
                    ? `Absorção aprovada: ${dinheiro(previa.diferenca)}. OS liberada.`
                    : absorcaoReprovada
                      ? 'Absorção reprovada. Gere venda complementar ou peça nova aprovação se as medidas mudarem.'
                      : absorcaoPendente
                        ? isAdmin
                          ? `Solicitação pendente para absorver ${dinheiro(previa.diferenca)}. Confira os itens acima antes de aprovar.`
                          : 'Solicitação enviada ao administrador. A OS fica bloqueada até aprovação ou cobrança da diferença.'
                        : isAdmin
                          ? 'Para seguir sem venda complementar, aprove a absorção da diferença.'
                          : 'Para seguir sem venda complementar, solicite aprovação de um administrador.'}
                </div>
                {isAdmin ? (
                  absorcaoPendente ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-default btn-sm" disabled={decidindoAbsorcao !== null} onClick={() => void decidirAbsorcao('reprovar')}>
                        {decidindoAbsorcao === 'reprovar' ? 'Reprovando...' : 'Reprovar'}
                      </button>
                      <button type="button" className="btn btn-info btn-sm" disabled={decidindoAbsorcao !== null} onClick={() => void decidirAbsorcao('aprovar')}>
                        {decidindoAbsorcao === 'aprovar' ? 'Aprovando...' : 'Aprovar absorção'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-info btn-sm"
                      disabled={diferencaAbsorvida || absorcaoAprovada || absorcaoReprovada}
                      title="Autorizar geração da OS absorvendo a diferença"
                      onClick={() => setDiferencaAbsorvida(true)}
                    >
                      {diferencaAbsorvida || absorcaoAprovada ? 'Diferença absorvida' : 'Absorver diferença'}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="btn btn-info btn-sm"
                    disabled={solicitandoAbsorcao || absorcaoPendente || absorcaoAprovada}
                    onClick={() => void solicitarAbsorcao()}
                  >
                    {solicitandoAbsorcao ? 'Solicitando...' : absorcaoPendente ? 'Solicitação enviada' : absorcaoAprovada ? 'Aprovada' : 'Solicitar absorção'}
                  </button>
                )}
              </div>
            )}
            {dados?.orcamento.ajuste_medicao_gerado && (
              <div className="text-sm-ui text-neutral-700 mt-2">Diferença já cobrada em venda complementar no GestãoClick. OS liberada.</div>
            )}
          </div>
        )}
        {temMedidaAlterada && !previa && (
          <div className="text-xs-ui text-neutral-500 mt-2">Recalcule a diferença para liberar a OS com medidas ou descontos alterados.</div>
        )}
      </div>
      <EtiquetaPreviewModal
        ordem={previaEtiqueta}
        imprimindo={previaEtiqueta ? imprimindoId === previaEtiqueta.id : false}
        onImprimir={(ordem) => {
          const origem = dados?.itens.map((it) => it.ordem).find((op): op is OrdemProducao => Boolean(op && op.id === ordem.id));
          if (origem) void imprimirEtiqueta(origem);
        }}
        onFechar={() => setPreviaEtiqueta(null)}
      />
    </div>
  );
}
