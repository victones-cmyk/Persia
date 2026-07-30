import type { Request, Response } from 'express';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { Prisma, type Orcamento, type OrdemProducao } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';
import { roundHalfUp } from '../services/calc/arredondamento';
import { isTipoPersiana, type TipoPersiana } from '../services/calc/tipos';
import { criarProduto, deletarProduto, inativarProduto } from '../services/gc/produtos';
import { criarVendaComPayload } from '../services/gc/vendas';
import { resolverLoja } from '../lib/resolverLoja';
import {
  recalcularPersianasDeEntrada,
  snapshotsDe,
  type ItemEntrada,
  type ItemSnapshot,
} from './orcamentoController';
import {
  recalcularCortinasDeEntrada,
  type CortinaEntrada,
} from './orcamentoCortinaController';
import {
  gerarPdfOrdensProducao,
  gerarPdfOrdemProducao,
  gerarZplEtiqueta,
  gerarZplEtiquetasImpressao,
  type ItemProducaoSnapshot,
  type OrdemDocumento,
} from '../services/producao/documentos';

function temAcesso(orc: Pick<Orcamento, 'usuario_id'>, sessao: Express.Request['session']['usuario']): boolean {
  return Boolean(sessao && (sessao.perfil === 'admin' || orc.usuario_id === sessao.id));
}

interface CortinaSnapshotProducao {
  ambiente?: string;
  modelo_cortina_nome?: string | null;
  modelo?: string;
  fixacao?: string;
  abertura?: string | number | null;
  desconto?: string | null;
  tamanho_barra?: number | null;
  tipo_barra?: string | null;
  largura?: number;
  altura?: number;
  n_camadas?: number;
  camadas?: Array<{
    nome?: string;
    tecido_nome?: string;
    modelo?: string | null;
    metodo?: string | null;
    metragem?: number;
    tiras?: number | null;
    barra_postica_base?: number | null;
    barra_postica_acrescimo?: number | null;
    valor_tecido?: number;
  }>;
  acessorios?: Array<{ item?: string; produto_nome?: string; quantidade?: number; preco?: number; subtotal?: number; medida_real?: number }>;
  valor_total?: number;
  nome_produto?: string;
}

interface AjusteMedida {
  index: number;
  largura: number;
  altura: number;
  desconto?: string;
  tamanho_barra?: number;
  tipo_barra?: 'simples' | 'dupla';
}

interface PreviaMedicao {
  itens: ItemProducaoSnapshot[];
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

interface AbsorcaoMedicao {
  status: 'solicitada' | 'aprovada' | 'reprovada';
  assinatura: string;
  medicoes: AjusteMedida[];
  previa: Omit<PreviaMedicao, 'itens'>;
  solicitante_id: string;
  solicitado_em: string;
  admin_id?: string;
  decidido_em?: string;
  motivo?: string;
}

type ItemProducaoSnapshotTecnico = ItemProducaoSnapshot & {
  tamanho_barra?: number | null;
  tipo_barra?: string | null;
};

function diferencaRelevante(v: number): boolean {
  return Math.abs(v) >= 0.01;
}

function respostaGcObj(orc: Pick<Orcamento, 'resposta_gc'>): Prisma.JsonObject {
  return orc.resposta_gc && typeof orc.resposta_gc === 'object' && !Array.isArray(orc.resposta_gc)
    ? orc.resposta_gc as Prisma.JsonObject
    : {};
}

function medicaoAbsorcao(orc: Pick<Orcamento, 'resposta_gc'>): AbsorcaoMedicao | null {
  const raw = respostaGcObj(orc).medicao_absorcao;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const status = obj.status;
  const assinatura = obj.assinatura;
  if (!['solicitada', 'aprovada', 'reprovada'].includes(String(status)) || typeof assinatura !== 'string') return null;
  return obj as unknown as AbsorcaoMedicao;
}

function vendaAjusteMedicaoGerada(orc: Pick<Orcamento, 'resposta_gc'>): boolean {
  return Boolean(respostaGcObj(orc).venda_ajuste_medicao);
}

function assinaturaMedicoes(medicoes: AjusteMedida[]): string {
  return JSON.stringify([...medicoes]
    .sort((a, b) => a.index - b.index)
    .map((m) => ({
      index: m.index,
      largura: roundHalfUp(m.largura),
      altura: roundHalfUp(m.altura),
      desconto: m.desconto ?? null,
      tamanho_barra: m.tamanho_barra != null ? roundHalfUp(m.tamanho_barra) : null,
      tipo_barra: m.tipo_barra ?? null,
    })));
}

function absorcaoAprovadaParaMedicoes(orc: Pick<Orcamento, 'resposta_gc'>, medicoes: AjusteMedida[]): boolean {
  const absorcao = medicaoAbsorcao(orc);
  return Boolean(absorcao && absorcao.status === 'aprovada' && absorcao.assinatura === assinaturaMedicoes(medicoes));
}

function numeroProducao(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function camadaLabel(index: number, nome?: string): string {
  return nome?.trim() || (index === 0 ? 'Frente' : `Camada ${index + 1}`);
}

function componenteTecidoCortina(cam: NonNullable<CortinaSnapshotProducao['camadas']>[number], index: number) {
  const label = camadaLabel(index, cam.nome);
  const tecido = cam.tecido_nome ?? '-';
  const metragem = Number(cam.metragem ?? 0);
  const tiras = Number(cam.tiras ?? 0);

  if (cam.metodo === 'emenda' && tiras > 0 && metragem > 0) {
    const faixa = metragem / tiras;
    return {
      grupo: 'Tecido',
      descricao: `${label}: ${tecido}`,
      quantidade: tiras,
      quantidade_label: `${tiras} x ${numeroProducao(faixa)} m`,
      unidade: 'm',
    };
  }

  if (cam.metodo === 'barra_postica') {
    const base = Number(cam.barra_postica_base ?? 0);
    const acrescimo = Number(cam.barra_postica_acrescimo ?? 0);
    return {
      grupo: 'Tecido',
      descricao: `${label}: ${tecido}`,
      quantidade: metragem,
      quantidade_label: base > 0 && acrescimo > 0
        ? `${numeroProducao(base)} + ${numeroProducao(acrescimo)} m`
        : (metragem > 0 ? `${numeroProducao(metragem)} m` : '-'),
      unidade: 'm',
    };
  }

  return {
    grupo: 'Tecido',
    descricao: `${label}: ${tecido}`,
    quantidade: metragem,
    quantidade_label: metragem > 0 ? `${numeroProducao(metragem)} m` : '-',
    unidade: 'm',
  };
}

function cortinaParaItem(c: CortinaSnapshotProducao): ItemProducaoSnapshot {
  const tecidos = c.camadas?.map((cam, i) => `${camadaLabel(i, cam.nome)}: ${cam.tecido_nome ?? '-'}`).join(' | ');
  const instalacao = (c.acessorios ?? []).find((a) => {
    const item = `${a.item ?? ''} ${a.produto_nome ?? ''}`.toLowerCase();
    return item.includes('instal');
  });
  return {
    ambiente: c.ambiente,
    tipo: c.modelo_cortina_nome ?? c.modelo,
    tecido_nome: tecidos || c.camadas?.[0]?.tecido_nome,
    fixacao: c.fixacao,
    abertura: c.abertura,
    desconto: c.desconto,
    tamanho_barra: c.tamanho_barra ?? null,
    tipo_barra: c.tipo_barra ?? null,
    largura_m: Number(c.largura ?? 0),
    altura_m: Number(c.altura ?? 0),
    n_camadas: c.n_camadas,
    camadas: c.camadas?.map((cam) => ({
      nome: cam.nome,
      modelo: cam.modelo ?? c.modelo,
      tecido_nome: cam.tecido_nome,
      metodo: cam.metodo,
      metragem: cam.metragem,
      tiras: cam.tiras,
      barra_postica_base: cam.barra_postica_base,
      barra_postica_acrescimo: cam.barra_postica_acrescimo,
    })),
    instalacao_nome: instalacao?.produto_nome ?? null,
    qtd_producao: c.camadas?.[0]?.metragem,
    nome_produto: c.nome_produto ?? `Cortina ${c.modelo ?? ''}`.trim(),
    valor_total: Number(c.valor_total ?? 0),
    valor_final: Number(c.valor_total ?? 0),
    descricao_produto: [
      c.fixacao ? `Fixacao: ${c.fixacao}` : null,
      c.n_camadas ? `Camadas: ${c.n_camadas}` : null,
      ...(c.camadas ?? []).map((cam, i) => `${camadaLabel(i, cam.nome)}: ${cam.tecido_nome ?? '-'} - ${cam.metragem ?? 0} m`),
    ].filter(Boolean).join('\n'),
    componentes: [
      ...(c.camadas ?? []).map(componenteTecidoCortina),
      // A produção corta na MEDIDA REAL; a quantidade cobrada (varão em passos
      // de venda) só vale para o valor do orçamento.
      ...(c.acessorios ?? []).map((a) => ({
        grupo: 'Acessorio',
        descricao: a.produto_nome || a.item || '-',
        quantidade: Number(a.medida_real ?? a.quantidade ?? 0),
        unidade: 'un',
      })),
    ],
  } as ItemProducaoSnapshotTecnico;
}

function aplicarDadosCortinaEntrada(item: ItemProducaoSnapshot, c?: CortinaEntrada): ItemProducaoSnapshot {
  if (!c) return item;
  return {
    ...item,
    tamanho_barra: c.tamanho_barra !== undefined && c.tamanho_barra !== '' ? Number(c.tamanho_barra) : null,
    tipo_barra: c.tipo_barra ?? null,
  } as ItemProducaoSnapshotTecnico;
}

function itensDoOrcamento(orc: Pick<Orcamento, 'itens_json' | 'entrada_json' | 'tipo_produto'>): ItemProducaoSnapshot[] {
  const json = orc.itens_json as unknown;
  const entrada = orc.entrada_json as { itens?: ItemEntrada[]; cortinas?: CortinaEntrada[] } | null;
  if (Array.isArray(json)) {
    const itens = json as ItemProducaoSnapshot[];
    if (orc.tipo_produto === 'cortina') {
      return itens.map((item, index) => aplicarDadosCortinaEntrada(item, entrada?.cortinas?.[index]));
    }
    if (orc.tipo_produto === 'misto') {
      const offset = entrada?.itens?.length ?? 0;
      return itens.map((item, index) => index >= offset ? aplicarDadosCortinaEntrada(item, entrada?.cortinas?.[index - offset]) : item);
    }
    return itens;
  }
  if (!json || typeof json !== 'object') return [];

  const obj = json as {
    persiana?: { itens?: ItemProducaoSnapshot[] };
    cortinas?: CortinaSnapshotProducao[];
  };
  const persianas = obj.persiana?.itens ?? [];
  return [
    ...persianas,
    ...(obj.cortinas ?? []).map((c, index) => aplicarDadosCortinaEntrada(cortinaParaItem(c), entrada?.cortinas?.[index])),
  ];
}

function valorItemProducao(item: ItemProducaoSnapshot): number {
  const obj = item as ItemProducaoSnapshot & { valor_final?: unknown; valor_total?: unknown };
  const n = Number(obj.valor_final ?? obj.valor_total ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function totalItens(itens: ItemProducaoSnapshot[]): number {
  return roundHalfUp(itens.reduce((s, item) => s + valorItemProducao(item), 0));
}

function numeroItem(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numeroOuNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nomeItemMedicao(item: ItemProducaoSnapshot, index: number): string {
  return String(item.nome_produto ?? item.tipo ?? `Item ${index + 1}`);
}

function detalhesDiferencaMedicao(
  vendidos: ItemProducaoSnapshot[],
  conferidos: ItemProducaoSnapshot[],
  ajustes: Map<number, AjusteMedida>,
): DetalheDiferencaMedicao[] {
  const total = Math.max(vendidos.length, conferidos.length);
  const detalhes: DetalheDiferencaMedicao[] = [];
  for (let index = 0; index < total; index += 1) {
    const vendido = vendidos[index];
    const conferido = conferidos[index] ?? vendido;
    if (!vendido || !conferido) continue;
    const valorVendido = roundHalfUp(valorItemProducao(vendido));
    const valorConferido = roundHalfUp(valorItemProducao(conferido));
    const diff = roundHalfUp(valorConferido - valorVendido);
    const alterado = ajustes.has(index);
    if (!alterado && !diferencaRelevante(diff)) continue;
    detalhes.push({
      index,
      ambiente: String(conferido.ambiente ?? vendido.ambiente ?? `Item ${index + 1}`),
      produto: nomeItemMedicao(conferido, index),
      valor_vendido: valorVendido,
      valor_conferido: valorConferido,
      diferenca: diff,
      largura_vendida: numeroItem(vendido.largura_m),
      altura_vendida: numeroItem(vendido.altura_m),
      largura_final: numeroItem(conferido.largura_m),
      altura_final: numeroItem(conferido.altura_m),
      desconto_vendido: typeof vendido.desconto === 'string' ? vendido.desconto : null,
      desconto_final: typeof conferido.desconto === 'string' ? conferido.desconto : null,
      tamanho_barra_vendida: numeroOuNull((vendido as ItemProducaoSnapshot & { tamanho_barra?: unknown }).tamanho_barra),
      tamanho_barra_final: numeroOuNull((conferido as ItemProducaoSnapshot & { tamanho_barra?: unknown }).tamanho_barra),
      tipo_barra_vendido: typeof (vendido as ItemProducaoSnapshot & { tipo_barra?: unknown }).tipo_barra === 'string' ? String((vendido as ItemProducaoSnapshot & { tipo_barra?: unknown }).tipo_barra) : null,
      tipo_barra_final: typeof (conferido as ItemProducaoSnapshot & { tipo_barra?: unknown }).tipo_barra === 'string' ? String((conferido as ItemProducaoSnapshot & { tipo_barra?: unknown }).tipo_barra) : null,
      alterado,
    });
  }
  return detalhes;
}

function previaParaAbsorcao(previa: PreviaMedicao): Omit<PreviaMedicao, 'itens'> {
  return {
    valor_original: previa.valor_original,
    valor_conferido: previa.valor_conferido,
    diferenca: previa.diferenca,
    alterados: previa.alterados,
    detalhes: previa.detalhes,
  };
}

function validarMedicoes(body: unknown): AjusteMedida[] {
  const raw = (body as { medicoes?: unknown } | null)?.medicoes;
  if (!Array.isArray(raw)) return [];
  const descontosValidos = new Set(['teto_ao_chao', 'gesso_ao_chao', 'sem_desconto', 'varao_ao_chao', 'suporte_de_teto']);
  return raw.map((m) => {
    const obj = m && typeof m === 'object' ? m as Record<string, unknown> : {};
    const index = Number(obj.index);
    const largura = Number(obj.largura);
    const altura = Number(obj.altura);
    if (!Number.isInteger(index) || index < 0 || !(largura > 0) || !(altura > 0)) {
      throw new AppError(400, 'MEDICAO_INVALIDA', 'Informe medidas finais válidas para todos os itens alterados.');
    }
    const desconto = typeof obj.desconto === 'string' && obj.desconto.trim()
      ? obj.desconto.trim()
      : undefined;
    if (desconto && !descontosValidos.has(desconto)) {
      throw new AppError(400, 'DESCONTO_INVALIDO', 'Informe um tipo de desconto válido.');
    }
    const tamanhoBarraRaw = obj.tamanho_barra;
    const tamanho_barra = tamanhoBarraRaw === undefined || tamanhoBarraRaw === null || tamanhoBarraRaw === ''
      ? undefined
      : Number(tamanhoBarraRaw);
    if (tamanho_barra !== undefined && (!(tamanho_barra >= 0) || tamanho_barra > 1)) {
      throw new AppError(400, 'BARRA_INVALIDA', 'Informe um tamanho de barra válido.');
    }
    const tipo_barra = obj.tipo_barra === 'simples' || obj.tipo_barra === 'dupla' ? obj.tipo_barra : undefined;
    return { index, largura, altura, ...(desconto ? { desconto } : {}), ...(tamanho_barra !== undefined ? { tamanho_barra } : {}), ...(tipo_barra ? { tipo_barra } : {}) };
  });
}

function medicoesPorIndex(medicoes: AjusteMedida[], total: number): Map<number, AjusteMedida> {
  const map = new Map<number, AjusteMedida>();
  for (const m of medicoes) {
    if (m.index >= total) throw new AppError(400, 'ITEM_INVALIDO', 'Produto selecionado inválido.');
    map.set(m.index, m);
  }
  return map;
}

function aplicarMedida<T extends { largura?: unknown; altura?: unknown; desconto?: unknown; tamanho_barra?: unknown; tipo_barra?: unknown }>(item: T, ajuste?: AjusteMedida): T {
  if (!ajuste) return item;
  return {
    ...item,
    largura: ajuste.largura,
    altura: ajuste.altura,
    ...(ajuste.desconto ? { desconto: ajuste.desconto } : {}),
    ...(ajuste.tamanho_barra !== undefined ? { tamanho_barra: ajuste.tamanho_barra } : {}),
    ...(ajuste.tipo_barra ? { tipo_barra: ajuste.tipo_barra } : {}),
  };
}

async function recalcularMedicao(orc: Orcamento, medicoes: AjusteMedida[]): Promise<PreviaMedicao> {
  const itensAtuais = itensDoOrcamento(orc);
  if (itensAtuais.length === 0) throw new AppError(409, 'SEM_ITENS', 'Este orçamento não possui itens para produção.');
  const ajustes = medicoesPorIndex(medicoes, itensAtuais.length);
  const valorOriginal = totalItens(itensAtuais) || Number(orc.valor_final);

  if (ajustes.size === 0) {
    return {
      itens: itensAtuais,
      valor_original: roundHalfUp(valorOriginal),
      valor_conferido: roundHalfUp(valorOriginal),
      diferenca: 0,
      alterados: [],
      detalhes: [],
    };
  }

  const entrada = orc.entrada_json as {
    tipo?: string;
    itens?: ItemEntrada[];
    cortinas?: CortinaEntrada[];
    rt_pct?: number;
  } | null;
  if (!entrada) {
    throw new AppError(409, 'SEM_ENTRADA_ORIGINAL', 'Não foi possível recalcular: este orçamento não possui entrada original salva.');
  }

  if (orc.tipo_produto === 'cortina') {
    const cortinasEntrada = entrada.cortinas ?? [];
    if (cortinasEntrada.length === 0) throw new AppError(409, 'SEM_ENTRADA_ORIGINAL', 'Orçamento de cortina sem entrada original.');
    const ajustadas = cortinasEntrada.map((c, index) => aplicarMedida(c, ajustes.get(index)));
    const preparadas = await recalcularCortinasDeEntrada(ajustadas, Number(entrada.rt_pct) || 0);
    const itens = preparadas.map((p) => cortinaParaItem(p.snapshot as CortinaSnapshotProducao));
    const valorConferido = totalItens(itens);
    return {
      itens,
      valor_original: roundHalfUp(valorOriginal),
      valor_conferido: valorConferido,
      diferenca: roundHalfUp(valorConferido - valorOriginal),
      alterados: Array.from(ajustes.keys()).sort((a, b) => a - b),
      detalhes: detalhesDiferencaMedicao(itensAtuais, itens, ajustes),
    };
  }

  if (orc.tipo_produto === 'misto') {
    const persianasEntrada = entrada.itens ?? [];
    const cortinasEntrada = entrada.cortinas ?? [];
    const persianasAjustadas = persianasEntrada.map((it, index) => aplicarMedida(it, ajustes.get(index)));
    const cortinasAjustadas = cortinasEntrada.map((c, index) => aplicarMedida(c, ajustes.get(persianasEntrada.length + index)));
    const rtPct = Number(entrada.rt_pct) || 0;
    const persPrep = persianasAjustadas.length > 0
      ? await recalcularPersianasDeEntrada(isTipoPersiana(entrada.tipo ?? '') ? (entrada.tipo as TipoPersiana) : null, persianasAjustadas, rtPct)
      : [];
    const cortPrep = cortinasAjustadas.length > 0
      ? await recalcularCortinasDeEntrada(cortinasAjustadas, rtPct)
      : [];
    const persSnaps = snapshotsDe(persPrep, []);
    const itens = [
      ...(persSnaps as unknown as ItemProducaoSnapshot[]),
      ...cortPrep.map((p) => cortinaParaItem(p.snapshot as CortinaSnapshotProducao)),
    ];
    const valorConferido = totalItens(itens);
    return {
      itens,
      valor_original: roundHalfUp(valorOriginal),
      valor_conferido: valorConferido,
      diferenca: roundHalfUp(valorConferido - valorOriginal),
      alterados: Array.from(ajustes.keys()).sort((a, b) => a - b),
      detalhes: detalhesDiferencaMedicao(itensAtuais, itens, ajustes),
    };
  }

  const itensEntrada = entrada.itens ?? [];
  if (itensEntrada.length === 0) throw new AppError(409, 'SEM_ENTRADA_ORIGINAL', 'Orçamento de persiana sem entrada original.');
  const ajustados = itensEntrada.map((it, index) => aplicarMedida(it, ajustes.get(index)));
  const preparados = await recalcularPersianasDeEntrada(isTipoPersiana(entrada.tipo ?? '') ? (entrada.tipo as TipoPersiana) : null, ajustados, Number(entrada.rt_pct) || 0);
  const idsAtuais = ((orc.itens_json as unknown as ItemSnapshot[] | null) ?? []).map((s) => s.gc_produto_id ?? null);
  const itens = snapshotsDe(preparados, idsAtuais.filter((id): id is string => Boolean(id))) as unknown as ItemProducaoSnapshot[];
  const valorConferido = totalItens(itens);
  return {
    itens,
    valor_original: roundHalfUp(valorOriginal),
    valor_conferido: valorConferido,
    diferenca: roundHalfUp(valorConferido - valorOriginal),
    alterados: Array.from(ajustes.keys()).sort((a, b) => a - b),
    detalhes: detalhesDiferencaMedicao(itensAtuais, itens, ajustes),
  };
}

function pedidoCodigo(orc: Pick<Orcamento, 'gc_pedido_codigo'>): string {
  return (orc.gc_pedido_codigo ?? '').trim();
}

function validarPedido(v: unknown): string {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  if (!s) throw new AppError(400, 'PEDIDO_OBRIGATORIO', 'Informe o número do pedido antes de gerar a ordem.');
  if (s.length > 50) throw new AppError(400, 'PEDIDO_INVALIDO', 'O número do pedido deve ter no máximo 50 caracteres.');
  return s;
}

function validarDataEntrega(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new AppError(400, 'DATA_ENTREGA_INVALIDA', 'Informe a data de entrega no formato AAAA-MM-DD.');
  }
  const [ano, mes, dia] = v.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    throw new AppError(400, 'DATA_ENTREGA_INVALIDA', 'Informe uma data de entrega válida.');
  }
  return data;
}

function validarOrcamentoParaProducao(orc: Pick<Orcamento, 'status' | 'gc_pedido_codigo'>): void {
  if (orc.status !== 'enviado') {
    throw new AppError(409, 'ORCAMENTO_NAO_ENVIADO', 'A ordem de produção só pode ser gerada para orçamentos enviados.');
  }
  if (!pedidoCodigo(orc)) {
    throw new AppError(409, 'PEDIDO_NAO_INFORMADO', 'Informe o número do pedido antes de gerar a ordem de produção.');
  }
}

function parteCodigo(v: string | null | undefined, fallback: string): string {
  const limpo = (v ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(-10);
  return limpo || fallback;
}

function codigoOrdem(orc: Pick<Orcamento, 'gc_pedido_codigo' | 'gc_codigo' | 'gc_orcamento_id'>, itemIndex: number): string {
  const pedido = parteCodigo(orc.gc_pedido_codigo, 'PED');
  const orcamento = parteCodigo(orc.gc_codigo ?? orc.gc_orcamento_id, 'ORC');
  return `OP-${pedido}-${orcamento}-${String(itemIndex + 1).padStart(2, '0')}`.slice(0, 30);
}

async function buscarOrcamento(id: string) {
  return prisma.orcamento.findUnique({
    where: { id },
    include: {
      loja: { select: { nome: true } },
      usuario: { select: { nome: true } },
      ordens_producao: { orderBy: { item_index: 'asc' } },
    },
  });
}

async function carregarOrcamentoAutorizado(req: Request) {
  const orc = await buscarOrcamento(String(req.params.id));
  if (!orc || !temAcesso(orc, req.session.usuario)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  }
  return orc;
}

function ordemParaDocumento(
  ordem: OrdemProducao,
  orc: Orcamento & { loja?: { nome: string } | null; usuario?: { nome: string } | null; ordens_producao?: OrdemProducao[] },
  etiquetaEmbalagem?: OrdemDocumento['etiquetaEmbalagem'],
): OrdemDocumento {
  const ordensPedido = orc.ordens_producao?.length ? orc.ordens_producao : [ordem];
  const tipoPeca = tipoDocumentoProducao(ordem);
  const ordensDoTipo = ordensPedido.filter((op) => tipoDocumentoProducao(op) === tipoPeca);
  const pecaIndex = Math.max(0, ordensDoTipo.findIndex((op) => op.id === ordem.id));

  return {
    codigo: ordem.codigo,
    pedidoCodigo: ordem.gc_pedido_codigo,
    orcamentoCodigo: orc.gc_codigo ?? orc.gc_orcamento_id ?? '-',
    cliente: orc.nome_cliente,
    loja: orc.loja?.nome ?? null,
    vendedor: orc.usuario?.nome ?? null,
    tipoProduto: ordem.tipo_produto,
    criadoEm: ordem.criado_em,
    entradaEm: ordem.impresso_em ?? new Date(),
    entregaEm: orc.pedido_entrega_em,
    peca: {
      tipo: tipoPeca,
      numero: pecaIndex + 1,
      total: Math.max(1, ordensDoTipo.length),
    },
    etiquetaEmbalagem: etiquetaEmbalagem ?? null,
    item: ordem.item_snapshot_json as unknown as ItemProducaoSnapshot,
  };
}

export async function getProducaoOrcamento(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  const itens = itensDoOrcamento(orc);
  const ordensPorItem = new Map(orc.ordens_producao.map((op) => [op.item_index, op]));

  res.json({
    orcamento: {
      id: orc.id,
      status: orc.status,
      tipo_produto: orc.tipo_produto,
      nome_cliente: orc.nome_cliente,
      gc_codigo: orc.gc_codigo,
      gc_orcamento_id: orc.gc_orcamento_id,
      gc_pedido_id: orc.gc_pedido_id,
      gc_pedido_codigo: orc.gc_pedido_codigo,
      pedido_confirmado_em: orc.pedido_confirmado_em,
      pedido_entrega_em: orc.pedido_entrega_em,
      ajuste_medicao_gerado: vendaAjusteMedicaoGerada(orc),
      medicao_absorcao: medicaoAbsorcao(orc),
    },
    itens: itens.map((item, index) => ({
      index,
      item,
      ordem: ordensPorItem.get(index) ?? null,
    })),
  });
}

export async function atualizarPedidoOrcamento(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  if (orc.status !== 'enviado') {
    throw new AppError(409, 'ORCAMENTO_NAO_ENVIADO', 'Informe pedido apenas em orçamentos enviados.');
  }
  const codigo = validarPedido((req.body as { gc_pedido_codigo?: unknown } | null)?.gc_pedido_codigo);
  const entrega = validarDataEntrega((req.body as { pedido_entrega_em?: unknown } | null)?.pedido_entrega_em);
  const atualizado = await prisma.orcamento.update({
    where: { id: orc.id },
    data: {
      gc_pedido_codigo: codigo,
      gc_pedido_id: typeof req.body?.gc_pedido_id === 'string' && req.body.gc_pedido_id.trim() ? req.body.gc_pedido_id.trim() : null,
      pedido_confirmado_em: new Date(),
      pedido_entrega_em: entrega,
    },
  });
  await prisma.logAcao.create({
    data: { usuario_id: req.session.usuario!.id, acao: 'pedido_orcamento_atualizado', detalhe: { orcamento_id: orc.id, gc_pedido_codigo: codigo, pedido_entrega_em: entrega?.toISOString().slice(0, 10) ?? null } },
  });
  res.json({ orcamento: atualizado });
}

export async function criarOrdensProducao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  validarOrcamentoParaProducao(orc);
  const previa = await recalcularMedicao(orc, validarMedicoes(req.body));
  const itens = previa.itens;
  if (itens.length === 0) throw new AppError(409, 'SEM_ITENS', 'Este orçamento não possui itens para produção.');
  const absorverDiferenca = (req.body as { absorver_diferenca?: unknown } | null)?.absorver_diferenca === true;
  const ajusteGerado = vendaAjusteMedicaoGerada(orc);
  const absorcaoAprovada = absorcaoAprovadaParaMedicoes(orc, validarMedicoes(req.body));
  if (diferencaRelevante(previa.diferenca) && !absorverDiferenca && !ajusteGerado && !absorcaoAprovada) {
    throw new AppError(409, 'DIFERENCA_NAO_AUTORIZADA', 'A diferença da medição deve ser absorvida por um admin ou cobrada em venda complementar antes de gerar a OS.');
  }
  if (absorverDiferenca && req.session.usuario?.perfil !== 'admin') {
    throw new AppError(403, 'APENAS_ADMIN', 'Apenas administradores podem absorver diferença de medição.');
  }

  const indicesRaw = (req.body as { itens?: unknown } | null)?.itens;
  const indices = Array.isArray(indicesRaw)
    ? Array.from(new Set(indicesRaw.map((v) => Number(v)).filter((v) => Number.isInteger(v))))
    : [];
  if (indices.length === 0) throw new AppError(400, 'ITENS_OBRIGATORIOS', 'Selecione ao menos um produto.');
  for (const idx of indices) {
    if (idx < 0 || idx >= itens.length) throw new AppError(400, 'ITEM_INVALIDO', 'Produto selecionado inválido.');
  }

  const criadas = await prisma.$transaction(async (tx) => {
    const out: OrdemProducao[] = [];
    for (const idx of indices) {
      const existente = await tx.ordemProducao.findUnique({
        where: { orcamento_id_item_index: { orcamento_id: orc.id, item_index: idx } },
      });
      if (existente) {
        out.push(existente);
        continue;
      }
      out.push(await tx.ordemProducao.create({
        data: {
          codigo: codigoOrdem(orc, idx),
          orcamento_id: orc.id,
          usuario_id: req.session.usuario!.id,
          item_index: idx,
          gc_pedido_id: orc.gc_pedido_id,
          gc_pedido_codigo: pedidoCodigo(orc),
          tipo_produto: orc.tipo_produto,
          item_snapshot_json: itens[idx] as unknown as Prisma.InputJsonValue,
        },
      }));
    }
    await tx.logAcao.create({
      data: { usuario_id: req.session.usuario!.id, acao: 'ordens_producao_criadas', detalhe: { orcamento_id: orc.id, itens: indices, medicao: previa, diferenca_absorvida: absorverDiferenca || absorcaoAprovada, venda_ajuste_medicao_gerada: ajusteGerado } as unknown as Prisma.InputJsonValue },
    });
    return out;
  });

  res.status(201).json({ ordens: criadas });
}

export async function preverMedicaoProducao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  validarOrcamentoParaProducao(orc);
  const previa = await recalcularMedicao(orc, validarMedicoes(req.body));
  res.json({ previa });
}

export async function solicitarAbsorcaoMedicao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  validarOrcamentoParaProducao(orc);
  const medicoes = validarMedicoes(req.body);
  const previa = await recalcularMedicao(orc, medicoes);
  if (!diferencaRelevante(previa.diferenca)) {
    throw new AppError(400, 'SEM_DIFERENCA', 'Não há diferença relevante para solicitar absorção.');
  }
  const respostaAtual = respostaGcObj(orc);
  const absorcao: AbsorcaoMedicao = {
    status: 'solicitada',
    assinatura: assinaturaMedicoes(medicoes),
    medicoes,
    previa: previaParaAbsorcao(previa),
    solicitante_id: req.session.usuario!.id,
    solicitado_em: new Date().toISOString(),
  };
  const atualizado = await prisma.orcamento.update({
    where: { id: orc.id },
    data: {
      resposta_gc: {
        ...respostaAtual,
        medicao_absorcao: absorcao,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.logAcao.create({
    data: {
      usuario_id: req.session.usuario!.id,
      acao: 'medicao_absorcao_solicitada',
      detalhe: { orcamento_id: orc.id, gc_pedido_codigo: pedidoCodigo(orc), medicao_absorcao: absorcao } as unknown as Prisma.InputJsonValue,
    },
  });
  res.json({ orcamento: atualizado, medicao_absorcao: absorcao });
}

export async function decidirAbsorcaoMedicao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  validarOrcamentoParaProducao(orc);
  if (req.session.usuario?.perfil !== 'admin') {
    throw new AppError(403, 'APENAS_ADMIN', 'Apenas administradores podem aprovar absorção de diferença.');
  }
  const acao = String((req.body as { acao?: unknown } | null)?.acao ?? '').trim();
  if (!['aprovar', 'reprovar'].includes(acao)) {
    throw new AppError(400, 'ACAO_INVALIDA', 'Informe se a diferença deve ser aprovada ou reprovada.');
  }
  const atual = medicaoAbsorcao(orc);
  if (!atual || atual.status !== 'solicitada') {
    throw new AppError(409, 'SEM_SOLICITACAO', 'Não há solicitação pendente de absorção para este orçamento.');
  }
  const motivoRaw = (req.body as { motivo?: unknown } | null)?.motivo;
  const motivo = typeof motivoRaw === 'string' && motivoRaw.trim() ? motivoRaw.trim().slice(0, 500) : undefined;
  const decisao: AbsorcaoMedicao = {
    ...atual,
    status: acao === 'aprovar' ? 'aprovada' : 'reprovada',
    admin_id: req.session.usuario.id,
    decidido_em: new Date().toISOString(),
    ...(motivo ? { motivo } : {}),
  };
  const respostaAtual = respostaGcObj(orc);
  const atualizado = await prisma.orcamento.update({
    where: { id: orc.id },
    data: {
      resposta_gc: {
        ...respostaAtual,
        medicao_absorcao: decisao,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.logAcao.create({
    data: {
      usuario_id: req.session.usuario.id,
      acao: decisao.status === 'aprovada' ? 'medicao_absorcao_aprovada' : 'medicao_absorcao_reprovada',
      detalhe: { orcamento_id: orc.id, gc_pedido_codigo: pedidoCodigo(orc), medicao_absorcao: decisao } as unknown as Prisma.InputJsonValue,
    },
  });
  res.json({ orcamento: atualizado, medicao_absorcao: decisao });
}

export async function gerarVendaAjusteMedicao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  validarOrcamentoParaProducao(orc);
  if (!orc.gc_cliente_id) throw new AppError(409, 'SEM_CLIENTE', 'Orçamento sem cliente vinculado ao GestãoClick.');
  const respostaAtual = respostaGcObj(orc);
  if (respostaAtual.venda_ajuste_medicao) {
    throw new AppError(409, 'AJUSTE_JA_GERADO', 'Este orçamento já possui venda complementar de medição técnica.');
  }

  const previa = await recalcularMedicao(orc, validarMedicoes(req.body));
  if (!(previa.diferenca > 0)) {
    throw new AppError(400, 'SEM_DIFERENCA_POSITIVA', 'A venda complementar só é gerada quando existe diferença positiva.');
  }

  const pedido = pedidoCodigo(orc);
  const nome = `Diferença de valores do pedido ${pedido} após medição técnica`;
  const descricao = [
    `Pedido original: ${pedido}`,
    `Orcamento: ${orc.gc_codigo ?? orc.gc_orcamento_id ?? '-'}`,
    `Valor original: R$ ${previa.valor_original.toFixed(2)}`,
    `Valor conferido: R$ ${previa.valor_conferido.toFixed(2)}`,
    `Diferenca: R$ ${previa.diferenca.toFixed(2)}`,
  ].join(' | ');
  const loja = await resolverLoja(orc.loja_id);
  let produtoId: string | null = null;
  try {
    const produto = await criarProduto({
      nome,
      descricao,
      valor_custo: 0,
      valor_venda: previa.diferenca,
    });
    produtoId = produto.criado ? produto.gc_produto_id : null;
    const payload: Record<string, unknown> = {
      tipo: 'produto',
      cliente_id: orc.gc_cliente_id,
      data: new Date().toISOString().slice(0, 10),
      produtos: [{
        produto_id: produto.gc_produto_id,
        quantidade: 1,
        valor_venda: previa.diferenca,
        valor_custo: 0,
      }],
    };
    if (env.GC_USUARIO_INTEGRACAO_ID) payload.usuario_id = env.GC_USUARIO_INTEGRACAO_ID;
    if (req.session.usuario?.gc_usuario_id) payload.vendedor_id = req.session.usuario.gc_usuario_id;
    if (loja.gc_loja_id) payload.loja_id = loja.gc_loja_id;

    const venda = await criarVendaComPayload(payload);
    await prisma.orcamento.update({
      where: { id: orc.id },
      data: {
        resposta_gc: {
          ...respostaAtual,
          venda_ajuste_medicao: venda.resposta,
          payload_venda_ajuste_medicao: venda.payload,
        } as Prisma.InputJsonValue,
        erro_gc: null,
      },
    });
    await prisma.logAcao.create({
      data: {
        usuario_id: req.session.usuario!.id,
        acao: 'venda_ajuste_medicao_gc',
        detalhe: { orcamento_id: orc.id, pedido, diferenca: previa.diferenca, gc_pedido_id: venda.gc_pedido_id, gc_pedido_codigo: venda.gc_pedido_codigo },
      },
    });
    // O produto "Diferença de valores..." é de uso único: some da busca do PDV
    // assim que a venda complementar existe (best-effort).
    if (produtoId) {
      try { await inativarProduto(produtoId); } catch { /* sem impacto na venda */ }
    }
    res.json({ venda, previa });
  } catch (err) {
    if (produtoId) {
      try { await deletarProduto(produtoId); } catch { /* ignora limpeza */ }
    }
    throw err;
  }
}

async function carregarOrdemAutorizada(req: Request) {
  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: String(req.params.id) },
    include: {
      orcamento: {
        include: {
          loja: { select: { nome: true } },
          usuario: { select: { nome: true } },
          ordens_producao: { orderBy: { item_index: 'asc' } },
        },
      },
    },
  });
  if (!ordem || !temAcesso(ordem.orcamento, req.session.usuario)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Ordem de produção não encontrada.');
  }
  return ordem;
}

export async function baixarPdfOrdem(req: Request, res: Response): Promise<void> {
  const ordem = await carregarOrdemAutorizada(req);
  const pdf = await gerarPdfOrdemProducao(ordemParaDocumento(ordem, ordem.orcamento));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ordem.codigo}.pdf"`);
  res.send(pdf);
}

export async function baixarZplEtiqueta(req: Request, res: Response): Promise<void> {
  const ordem = await carregarOrdemAutorizada(req);
  const zpl = gerarZplEtiqueta(ordemParaDocumento(ordem, ordem.orcamento), env.ZEBRA_DPI);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${ordem.codigo}.zpl"`);
  res.send(zpl);
}

function imprimirRawCups(zpl: string): Promise<void> {
  const printer = env.ZEBRA_PRINTER_NAME.trim();
  if (!printer) {
    throw new AppError(400, 'IMPRESSORA_NAO_CONFIGURADA', 'Configure ZEBRA_PRINTER_NAME no servidor para imprimir etiquetas.');
  }

  return new Promise((resolve, reject) => {
    const child = spawn('lp', ['-d', printer, '-o', 'raw'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      reject(new AppError(500, 'FALHA_CUPS', `Falha ao chamar CUPS: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new AppError(500, 'FALHA_IMPRESSAO', stderr.trim() || `CUPS retornou código ${code}.`));
      }
    });
    child.stdin.end(zpl);
  });
}

function imprimirRawTcp(zpl: string): Promise<void> {
  const host = env.ZEBRA_HOST.trim();
  const port = env.ZEBRA_PORT;
  if (!host) {
    throw new AppError(400, 'IMPRESSORA_NAO_CONFIGURADA', 'Configure ZEBRA_HOST no servidor para imprimir etiquetas via TCP.');
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let finalizado = false;

    const encerrarComErro = (err: Error) => {
      if (finalizado) return;
      finalizado = true;
      socket.destroy();
      reject(new AppError(500, 'FALHA_IMPRESSAO_TCP', `Falha ao enviar etiqueta para ${host}:${port}: ${err.message}`));
    };

    socket.setTimeout(env.ZEBRA_TCP_TIMEOUT_MS);
    socket.on('connect', () => {
      socket.end(zpl);
    });
    socket.on('timeout', () => {
      encerrarComErro(new Error('tempo limite esgotado'));
    });
    socket.on('error', encerrarComErro);
    socket.on('close', (hadError) => {
      if (!finalizado && !hadError) {
        finalizado = true;
        resolve();
      }
    });
  });
}

function imprimirRawEtiqueta(zpl: string): Promise<void> {
  return env.ZEBRA_HOST.trim() ? imprimirRawTcp(zpl) : imprimirRawCups(zpl);
}

function itemSnapshotDaOrdem(ordem: Pick<OrdemProducao, 'item_snapshot_json'>): ItemProducaoSnapshot {
  return ordem.item_snapshot_json as unknown as ItemProducaoSnapshot;
}

function itemPareceCortina(item: ItemProducaoSnapshot): boolean {
  const descricao = [
    item.nome_produto,
    item.tipo,
    item.descricao_produto,
  ].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return Boolean(
    item.camadas?.length
    || item.fixacao
    || item.abertura
    || item.desconto
    || descricao.includes('cortina')
    || descricao.includes('wave')
    || descricao.includes('prega')
    || descricao.includes('ilhos')
    || descricao.includes('franzido'),
  );
}

function ehOrdemPersiana(ordem: Pick<OrdemProducao, 'tipo_produto' | 'item_snapshot_json'>): boolean {
  const item = itemSnapshotDaOrdem(ordem);
  if (String(ordem.tipo_produto) === 'persiana') return true;
  if (String(ordem.tipo_produto) === 'cortina') return false;
  if (itemPareceCortina(item)) return false;
  return true;
}

type TipoDocumentoProducao = 'persiana' | 'cortina';
type StatusFiltroProducao = 'criada' | 'impressa' | 'cancelada';

function tipoDocumentoProducao(ordem: Pick<OrdemProducao, 'tipo_produto' | 'item_snapshot_json'>): TipoDocumentoProducao {
  return ehOrdemPersiana(ordem) ? 'persiana' : 'cortina';
}

function filtroTipoDocumento(req: Request): TipoDocumentoProducao | null {
  const tipo = String(req.query.tipo ?? '').trim().toLowerCase();
  if (!tipo) return null;
  if (tipo === 'persiana' || tipo === 'cortina') return tipo;
  throw new AppError(400, 'TIPO_INVALIDO', 'Informe tipo=persiana ou tipo=cortina.');
}

// Por padrão as ações em lote (imprimir etiquetas) só devem repetir o que ainda
// não foi impresso — sem isso, reabrir o modal e clicar de novo reimprime tudo
// que já saiu na Zebra, sempre que o vendedor gera uma nova OS avulsa.
function apenasPendentes(req: Request): boolean {
  return req.query.apenas_pendentes === '1' || req.query.apenas_pendentes === 'true';
}

function ordensFiltradasPorTipo(
  ordens: OrdemProducao[],
  tipo: TipoDocumentoProducao | null,
): OrdemProducao[] {
  return tipo ? ordens.filter((ordem) => tipoDocumentoProducao(ordem) === tipo) : ordens;
}

function dataFiltro(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [ano, mes, dia] = v.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data;
}

function normalizarBusca(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function textoBusca(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

async function proximoSerialEtiqueta(tx: Prisma.TransactionClient): Promise<number> {
  const chave = 'etiqueta_persiana_serial';
  const existente = await tx.configuracao.findUnique({ where: { chave } });
  const atual = Number(existente?.valor ?? 5999);
  const proximo = Math.max(Number.isFinite(atual) ? atual : 5999, 5999) + 1;
  await tx.configuracao.upsert({
    where: { chave },
    create: {
      chave,
      valor: String(proximo),
      descricao: 'Último S/N usado nas etiquetas de embalagem de persianas.',
    },
    update: { valor: String(proximo) },
  });
  return proximo;
}

async function prepararEtiquetaEmbalagemPersiana(ordem: OrdemProducao): Promise<{
  ordem: OrdemProducao;
  meta: OrdemDocumento['etiquetaEmbalagem'];
}> {
  if (!ehOrdemPersiana(ordem)) return { ordem, meta: null };

  return prisma.$transaction(async (tx) => {
    const ordensPedido = await tx.ordemProducao.findMany({
      where: { orcamento_id: ordem.orcamento_id },
      orderBy: { item_index: 'asc' },
    });
    const persianas = ordensPedido.filter(ehOrdemPersiana);
    const pecaIndex = Math.max(0, persianas.findIndex((op) => op.id === ordem.id));
    const snapshot = itemSnapshotDaOrdem(ordem);
    const serialExistente = Number(snapshot.etiqueta_embalagem_serial);
    const serial = Number.isFinite(serialExistente) && serialExistente >= 6000
      ? serialExistente
      : await proximoSerialEtiqueta(tx);

    if (serial === serialExistente) {
      return {
        ordem,
        meta: {
          pecaNumero: pecaIndex + 1,
          pecaTotal: Math.max(1, persianas.length),
          serial,
        },
      };
    }

    const itemAtualizado = {
      ...snapshot,
      etiqueta_embalagem_serial: serial,
    };
    const atualizada = await tx.ordemProducao.update({
      where: { id: ordem.id },
      data: { item_snapshot_json: itemAtualizado as unknown as Prisma.InputJsonValue },
    });

    return {
      ordem: atualizada,
      meta: {
        pecaNumero: pecaIndex + 1,
        pecaTotal: Math.max(1, persianas.length),
        serial,
      },
    };
  });
}

export async function imprimirEtiquetaOrdem(req: Request, res: Response): Promise<void> {
  const ordem = await carregarOrdemAutorizada(req);
  const etiqueta = await prepararEtiquetaEmbalagemPersiana(ordem);
  const zpl = gerarZplEtiquetasImpressao(ordemParaDocumento(etiqueta.ordem, ordem.orcamento, etiqueta.meta), env.ZEBRA_DPI);
  await imprimirRawEtiqueta(zpl);
  const atualizada = await prisma.ordemProducao.update({
    where: { id: ordem.id },
    data: { status: 'impressa', impresso_em: new Date() },
  });
  await prisma.logAcao.create({
    data: { usuario_id: req.session.usuario!.id, acao: 'etiqueta_ordem_impressa', detalhe: { ordem_id: ordem.id, codigo: ordem.codigo, impressora: env.ZEBRA_HOST || env.ZEBRA_PRINTER_NAME } },
  });
  res.json({ ordem: atualizada });
}

export async function baixarPdfOrdensOrcamento(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  const tipo = filtroTipoDocumento(req);
  const ordens = ordensFiltradasPorTipo(orc.ordens_producao, tipo);
  if (ordens.length === 0) {
    throw new AppError(404, 'SEM_ORDENS', `Nenhuma OS ${tipo ? `de ${tipo}` : ''} encontrada para este orçamento.`);
  }

  const docs = ordens.map((ordem) => ordemParaDocumento(ordem, orc));
  const pdf = await gerarPdfOrdensProducao(docs, `Ordens de Produção ${tipo ?? ''}`.trim());
  const sufixo = tipo ? `-${tipo}` : '';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="ordens-producao${sufixo}-${orc.gc_pedido_codigo ?? orc.id}.pdf"`);
  res.send(pdf);
}

export async function imprimirEtiquetasOrcamento(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  const tipo = filtroTipoDocumento(req);
  const somentePendentes = apenasPendentes(req);
  let ordens = ordensFiltradasPorTipo(orc.ordens_producao, tipo);
  if (somentePendentes) ordens = ordens.filter((ordem) => ordem.status !== 'impressa');
  if (ordens.length === 0) {
    const escopo = somentePendentes ? 'pendente' : '';
    throw new AppError(404, 'SEM_ORDENS', `Nenhuma etiqueta ${tipo ? `de ${tipo} ` : ''}${escopo} encontrada para este orçamento.`);
  }

  const docs: OrdemDocumento[] = [];
  for (const ordem of ordens) {
    if (tipoDocumentoProducao(ordem) === 'persiana') {
      const etiqueta = await prepararEtiquetaEmbalagemPersiana(ordem);
      docs.push(ordemParaDocumento(etiqueta.ordem, orc, etiqueta.meta));
      continue;
    }
    docs.push(ordemParaDocumento(ordem, orc));
  }

  const zpl = docs.map((doc) => gerarZplEtiquetasImpressao(doc, env.ZEBRA_DPI)).join('\n');
  await imprimirRawEtiqueta(zpl);

  await prisma.ordemProducao.updateMany({
    where: { id: { in: ordens.map((ordem) => ordem.id) } },
    data: { status: 'impressa', impresso_em: new Date() },
  });
  await prisma.logAcao.create({
    data: {
      usuario_id: req.session.usuario!.id,
      acao: 'etiquetas_ordens_impressas',
      detalhe: {
        orcamento_id: orc.id,
        tipo,
        quantidade: ordens.length,
        codigos: ordens.map((ordem) => ordem.codigo),
        impressora: env.ZEBRA_HOST || env.ZEBRA_PRINTER_NAME,
      },
    },
  });
  res.json({ quantidade: ordens.length, tipo });
}

/**
 * GET /orcamentos/producao/aprovacoes-pendentes — solicitações de absorção de
 * diferença de medição aguardando decisão do admin. Sem isso, a única forma de
 * um admin descobrir uma solicitação era reabrir manualmente o orçamento exato.
 */
export async function listarAprovacoesPendentesMedicao(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario;
  if (!sessao || sessao.perfil !== 'admin') {
    throw new AppError(403, 'APENAS_ADMIN', 'Apenas administradores podem ver aprovações pendentes.');
  }
  const orcamentos = await prisma.orcamento.findMany({
    where: {
      resposta_gc: { path: ['medicao_absorcao', 'status'], equals: 'solicitada' },
    },
    include: { usuario: { select: { nome: true } }, loja: { select: { nome: true } } },
    orderBy: { criado_em: 'desc' },
    take: 100,
  });
  const itens = orcamentos.map((orc) => {
    const absorcao = medicaoAbsorcao(orc);
    return {
      id: orc.id,
      tipo_produto: orc.tipo_produto,
      status: orc.status,
      nome_cliente: orc.nome_cliente,
      gc_orcamento_id: orc.gc_orcamento_id,
      gc_codigo: orc.gc_codigo,
      gc_pedido_codigo: orc.gc_pedido_codigo,
      valor_final: orc.valor_final,
      valor_bruto: orc.valor_bruto,
      criado_em: orc.criado_em,
      usuario: orc.usuario,
      loja: orc.loja,
      medicao_absorcao_diferenca: absorcao?.previa.diferenca ?? 0,
      medicao_absorcao_solicitado_em: absorcao?.solicitado_em ?? orc.criado_em.toISOString(),
    };
  });
  res.json({ total: itens.length, orcamentos: itens });
}

export async function listarOrdensProducao(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario;
  if (!sessao) throw new AppError(401, 'NAO_AUTENTICADO', 'Sessão expirada.');

  const status = String(req.query.status ?? '').trim() as StatusFiltroProducao | '';
  if (status && !['criada', 'impressa', 'cancelada'].includes(status)) {
    throw new AppError(400, 'STATUS_INVALIDO', 'Status de produção inválido.');
  }
  const tipo = filtroTipoDocumento(req);
  const entregaDe = dataFiltro(req.query.entrega_de);
  const entregaAte = dataFiltro(req.query.entrega_ate);
  const busca = normalizarBusca(req.query.q);

  const where: Prisma.OrdemProducaoWhereInput = {
    ...(status ? { status } : {}),
    ...(sessao.perfil === 'admin' ? {} : { orcamento: { usuario_id: sessao.id } }),
  };

  const ordens = await prisma.ordemProducao.findMany({
    where,
    include: {
      usuario: { select: { nome: true } },
      orcamento: {
        include: {
          loja: { select: { nome: true } },
          usuario: { select: { nome: true } },
        },
      },
    },
    orderBy: { criado_em: 'desc' },
    take: 500,
  });

  const filtradas = ordens
    .filter((ordem) => !tipo || tipoDocumentoProducao(ordem) === tipo)
    .filter((ordem) => {
      const entrega = ordem.orcamento.pedido_entrega_em;
      if (entregaDe && (!entrega || entrega < entregaDe)) return false;
      if (entregaAte) {
        const fim = new Date(entregaAte);
        fim.setUTCHours(23, 59, 59, 999);
        if (!entrega || entrega > fim) return false;
      }
      if (!busca) return true;
      const item = itemSnapshotDaOrdem(ordem);
      const alvo = normalizarBusca([
        ordem.codigo,
        ordem.gc_pedido_codigo,
        ordem.orcamento.gc_codigo,
        ordem.orcamento.gc_orcamento_id,
        ordem.orcamento.nome_cliente,
        ordem.orcamento.loja?.nome,
        ordem.orcamento.usuario?.nome,
        textoBusca(item.ambiente),
        textoBusca(item.nome_produto),
        textoBusca(item.tecido_nome),
      ].filter(Boolean).join(' '));
      return alvo.includes(busca);
    });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  const resumo = filtradas.reduce((acc, ordem) => {
    const t = tipoDocumentoProducao(ordem);
    const entrega = ordem.orcamento.pedido_entrega_em;
    acc.total += 1;
    if (ordem.status === 'criada') acc.criadas += 1;
    if (ordem.status === 'impressa') acc.impressas += 1;
    if (ordem.status === 'cancelada') acc.canceladas += 1;
    if (t === 'persiana') acc.persianas += 1;
    if (t === 'cortina') acc.cortinas += 1;
    if (entrega && entrega < hoje && ordem.status !== 'cancelada') acc.atrasadas += 1;
    if (entrega && entrega >= hoje && entrega < amanha && ordem.status !== 'cancelada') acc.entregaHoje += 1;
    return acc;
  }, {
    total: 0,
    criadas: 0,
    impressas: 0,
    canceladas: 0,
    persianas: 0,
    cortinas: 0,
    atrasadas: 0,
    entregaHoje: 0,
  });

  res.json({
    resumo,
    ordens: filtradas.map((ordem) => ({
      id: ordem.id,
      codigo: ordem.codigo,
      item_index: ordem.item_index,
      gc_pedido_codigo: ordem.gc_pedido_codigo,
      tipo_produto: ordem.tipo_produto,
      tipo_documento: tipoDocumentoProducao(ordem),
      status: ordem.status,
      criado_em: ordem.criado_em,
      impresso_em: ordem.impresso_em,
      gerado_por: ordem.usuario.nome,
      item_snapshot_json: ordem.item_snapshot_json,
      orcamento: {
        id: ordem.orcamento.id,
        status: ordem.orcamento.status,
        nome_cliente: ordem.orcamento.nome_cliente,
        gc_codigo: ordem.orcamento.gc_codigo,
        gc_orcamento_id: ordem.orcamento.gc_orcamento_id,
        gc_pedido_codigo: ordem.orcamento.gc_pedido_codigo,
        pedido_entrega_em: ordem.orcamento.pedido_entrega_em,
        loja_nome: ordem.orcamento.loja?.nome ?? null,
        vendedor_nome: ordem.orcamento.usuario?.nome ?? null,
      },
    })),
  });
}
