import type { Request, Response } from 'express';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { Prisma, type Orcamento, type OrdemProducao } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';
import { roundHalfUp } from '../services/calc/arredondamento';
import { isTipoPersiana, type TipoPersiana } from '../services/calc/tipos';
import { criarProduto, deletarProduto } from '../services/gc/produtos';
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
  acessorios?: Array<{ item?: string; produto_nome?: string; quantidade?: number; preco?: number; subtotal?: number }>;
  valor_total?: number;
  nome_produto?: string;
}

interface AjusteMedida {
  index: number;
  largura: number;
  altura: number;
}

interface PreviaMedicao {
  itens: ItemProducaoSnapshot[];
  valor_original: number;
  valor_conferido: number;
  diferenca: number;
  alterados: number[];
}

function diferencaRelevante(v: number): boolean {
  return Math.abs(v) >= 0.01;
}

function respostaGcObj(orc: Pick<Orcamento, 'resposta_gc'>): Prisma.JsonObject {
  return orc.resposta_gc && typeof orc.resposta_gc === 'object' && !Array.isArray(orc.resposta_gc)
    ? orc.resposta_gc as Prisma.JsonObject
    : {};
}

function vendaAjusteMedicaoGerada(orc: Pick<Orcamento, 'resposta_gc'>): boolean {
  return Boolean(respostaGcObj(orc).venda_ajuste_medicao);
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
      ...(c.acessorios ?? []).map((a) => ({
        grupo: 'Acessorio',
        descricao: a.produto_nome || a.item || '-',
        quantidade: Number(a.quantidade ?? 0),
        unidade: 'un',
      })),
    ],
  };
}

function itensDoOrcamento(orc: Pick<Orcamento, 'itens_json'>): ItemProducaoSnapshot[] {
  const json = orc.itens_json as unknown;
  if (Array.isArray(json)) return json as ItemProducaoSnapshot[];
  if (!json || typeof json !== 'object') return [];

  const obj = json as {
    persiana?: { itens?: ItemProducaoSnapshot[] };
    cortinas?: CortinaSnapshotProducao[];
  };
  return [
    ...(obj.persiana?.itens ?? []),
    ...(obj.cortinas ?? []).map(cortinaParaItem),
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

function validarMedicoes(body: unknown): AjusteMedida[] {
  const raw = (body as { medicoes?: unknown } | null)?.medicoes;
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => {
    const obj = m && typeof m === 'object' ? m as Record<string, unknown> : {};
    const index = Number(obj.index);
    const largura = Number(obj.largura);
    const altura = Number(obj.altura);
    if (!Number.isInteger(index) || index < 0 || !(largura > 0) || !(altura > 0)) {
      throw new AppError(400, 'MEDICAO_INVALIDA', 'Informe medidas finais validas para todos os itens alterados.');
    }
    return { index, largura, altura };
  });
}

function medicoesPorIndex(medicoes: AjusteMedida[], total: number): Map<number, AjusteMedida> {
  const map = new Map<number, AjusteMedida>();
  for (const m of medicoes) {
    if (m.index >= total) throw new AppError(400, 'ITEM_INVALIDO', 'Produto selecionado invalido.');
    map.set(m.index, m);
  }
  return map;
}

function aplicarMedida<T extends { largura?: unknown; altura?: unknown }>(item: T, ajuste?: AjusteMedida): T {
  if (!ajuste) return item;
  return { ...item, largura: ajuste.largura, altura: ajuste.altura };
}

async function recalcularMedicao(orc: Orcamento, medicoes: AjusteMedida[]): Promise<PreviaMedicao> {
  const itensAtuais = itensDoOrcamento(orc);
  if (itensAtuais.length === 0) throw new AppError(409, 'SEM_ITENS', 'Este orcamento nao possui itens para producao.');
  const ajustes = medicoesPorIndex(medicoes, itensAtuais.length);
  const valorOriginal = totalItens(itensAtuais) || Number(orc.valor_final);

  if (ajustes.size === 0) {
    return {
      itens: itensAtuais,
      valor_original: roundHalfUp(valorOriginal),
      valor_conferido: roundHalfUp(valorOriginal),
      diferenca: 0,
      alterados: [],
    };
  }

  const entrada = orc.entrada_json as {
    tipo?: string;
    itens?: ItemEntrada[];
    cortinas?: CortinaEntrada[];
    rt_pct?: number;
  } | null;
  if (!entrada) {
    throw new AppError(409, 'SEM_ENTRADA_ORIGINAL', 'Nao foi possivel recalcular: este orcamento nao possui entrada original salva.');
  }

  if (orc.tipo_produto === 'cortina') {
    const cortinasEntrada = entrada.cortinas ?? [];
    if (cortinasEntrada.length === 0) throw new AppError(409, 'SEM_ENTRADA_ORIGINAL', 'Orcamento de cortina sem entrada original.');
    const ajustadas = cortinasEntrada.map((c, index) => aplicarMedida(c, ajustes.get(index)));
    const preparadas = await recalcularCortinasDeEntrada(ajustadas, Number(entrada.rt_pct) || 0);
    const itens = preparadas.map((p) => cortinaParaItem(p.snapshot as CortinaSnapshotProducao));
    return {
      itens,
      valor_original: roundHalfUp(valorOriginal),
      valor_conferido: totalItens(itens),
      diferenca: roundHalfUp(totalItens(itens) - valorOriginal),
      alterados: Array.from(ajustes.keys()).sort((a, b) => a - b),
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
    return {
      itens,
      valor_original: roundHalfUp(valorOriginal),
      valor_conferido: totalItens(itens),
      diferenca: roundHalfUp(totalItens(itens) - valorOriginal),
      alterados: Array.from(ajustes.keys()).sort((a, b) => a - b),
    };
  }

  const itensEntrada = entrada.itens ?? [];
  if (itensEntrada.length === 0) throw new AppError(409, 'SEM_ENTRADA_ORIGINAL', 'Orcamento de persiana sem entrada original.');
  const ajustados = itensEntrada.map((it, index) => aplicarMedida(it, ajustes.get(index)));
  const preparados = await recalcularPersianasDeEntrada(isTipoPersiana(entrada.tipo ?? '') ? (entrada.tipo as TipoPersiana) : null, ajustados, Number(entrada.rt_pct) || 0);
  const idsAtuais = ((orc.itens_json as unknown as ItemSnapshot[] | null) ?? []).map((s) => s.gc_produto_id ?? null);
  const itens = snapshotsDe(preparados, idsAtuais.filter((id): id is string => Boolean(id))) as unknown as ItemProducaoSnapshot[];
  return {
    itens,
    valor_original: roundHalfUp(valorOriginal),
    valor_conferido: totalItens(itens),
    diferenca: roundHalfUp(totalItens(itens) - valorOriginal),
    alterados: Array.from(ajustes.keys()).sort((a, b) => a - b),
  };
}

function pedidoCodigo(orc: Pick<Orcamento, 'gc_pedido_codigo'>): string {
  return (orc.gc_pedido_codigo ?? '').trim();
}

function validarPedido(v: unknown): string {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  if (!s) throw new AppError(400, 'PEDIDO_OBRIGATORIO', 'Informe o numero do pedido antes de gerar a ordem.');
  if (s.length > 50) throw new AppError(400, 'PEDIDO_INVALIDO', 'O numero do pedido deve ter no maximo 50 caracteres.');
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
    throw new AppError(400, 'DATA_ENTREGA_INVALIDA', 'Informe uma data de entrega valida.');
  }
  return data;
}

function validarOrcamentoParaProducao(orc: Pick<Orcamento, 'status' | 'gc_pedido_codigo'>): void {
  if (orc.status !== 'enviado') {
    throw new AppError(409, 'ORCAMENTO_NAO_ENVIADO', 'A ordem de producao so pode ser gerada para orcamentos enviados.');
  }
  if (!pedidoCodigo(orc)) {
    throw new AppError(409, 'PEDIDO_NAO_INFORMADO', 'Informe o numero do pedido antes de gerar a ordem de producao.');
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
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orcamento nao encontrado.');
  }
  return orc;
}

function ordemParaDocumento(
  ordem: OrdemProducao,
  orc: Orcamento & { loja?: { nome: string } | null; usuario?: { nome: string } | null },
  etiquetaEmbalagem?: OrdemDocumento['etiquetaEmbalagem'],
): OrdemDocumento {
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
    throw new AppError(409, 'ORCAMENTO_NAO_ENVIADO', 'Informe pedido apenas em orcamentos enviados.');
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
  if (itens.length === 0) throw new AppError(409, 'SEM_ITENS', 'Este orcamento nao possui itens para producao.');
  const absorverDiferenca = (req.body as { absorver_diferenca?: unknown } | null)?.absorver_diferenca === true;
  const ajusteGerado = vendaAjusteMedicaoGerada(orc);
  if (diferencaRelevante(previa.diferenca) && !absorverDiferenca && !ajusteGerado) {
    throw new AppError(409, 'DIFERENCA_NAO_AUTORIZADA', 'A diferenca da medicao deve ser absorvida por um admin ou cobrada em venda complementar antes de gerar a OS.');
  }
  if (absorverDiferenca && req.session.usuario?.perfil !== 'admin') {
    throw new AppError(403, 'APENAS_ADMIN', 'Apenas administradores podem absorver diferenca de medicao.');
  }

  const indicesRaw = (req.body as { itens?: unknown } | null)?.itens;
  const indices = Array.isArray(indicesRaw)
    ? Array.from(new Set(indicesRaw.map((v) => Number(v)).filter((v) => Number.isInteger(v))))
    : [];
  if (indices.length === 0) throw new AppError(400, 'ITENS_OBRIGATORIOS', 'Selecione ao menos um produto.');
  for (const idx of indices) {
    if (idx < 0 || idx >= itens.length) throw new AppError(400, 'ITEM_INVALIDO', 'Produto selecionado invalido.');
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
      data: { usuario_id: req.session.usuario!.id, acao: 'ordens_producao_criadas', detalhe: { orcamento_id: orc.id, itens: indices, medicao: previa, diferenca_absorvida: absorverDiferenca, venda_ajuste_medicao_gerada: ajusteGerado } as unknown as Prisma.InputJsonValue },
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

export async function gerarVendaAjusteMedicao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  validarOrcamentoParaProducao(orc);
  if (!orc.gc_cliente_id) throw new AppError(409, 'SEM_CLIENTE', 'Orcamento sem cliente vinculado ao GestaoClick.');
  const respostaAtual = respostaGcObj(orc);
  if (respostaAtual.venda_ajuste_medicao) {
    throw new AppError(409, 'AJUSTE_JA_GERADO', 'Este orcamento ja possui venda complementar de medicao tecnica.');
  }

  const previa = await recalcularMedicao(orc, validarMedicoes(req.body));
  if (!(previa.diferenca > 0)) {
    throw new AppError(400, 'SEM_DIFERENCA_POSITIVA', 'A venda complementar so e gerada quando existe diferenca positiva.');
  }

  const pedido = pedidoCodigo(orc);
  const nome = `Diferenca de valores do pedido ${pedido} apos medicao tecnica`;
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
        },
      },
    },
  });
  if (!ordem || !temAcesso(ordem.orcamento, req.session.usuario)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Ordem de producao nao encontrada.');
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
        reject(new AppError(500, 'FALHA_IMPRESSAO', stderr.trim() || `CUPS retornou codigo ${code}.`));
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
      descricao: 'Ultimo S/N usado nas etiquetas de embalagem de persianas.',
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
    throw new AppError(404, 'SEM_ORDENS', `Nenhuma OS ${tipo ? `de ${tipo}` : ''} encontrada para este orcamento.`);
  }

  const docs = ordens.map((ordem) => ordemParaDocumento(ordem, orc));
  const pdf = await gerarPdfOrdensProducao(docs, `Ordens de Producao ${tipo ?? ''}`.trim());
  const sufixo = tipo ? `-${tipo}` : '';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="ordens-producao${sufixo}-${orc.gc_pedido_codigo ?? orc.id}.pdf"`);
  res.send(pdf);
}

export async function imprimirEtiquetasOrcamento(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  const tipo = filtroTipoDocumento(req);
  const ordens = ordensFiltradasPorTipo(orc.ordens_producao, tipo);
  if (ordens.length === 0) {
    throw new AppError(404, 'SEM_ORDENS', `Nenhuma etiqueta ${tipo ? `de ${tipo}` : ''} encontrada para este orcamento.`);
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

export async function listarOrdensProducao(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario;
  if (!sessao) throw new AppError(401, 'NAO_AUTENTICADO', 'Sessao expirada.');

  const status = String(req.query.status ?? '').trim() as StatusFiltroProducao | '';
  if (status && !['criada', 'impressa', 'cancelada'].includes(status)) {
    throw new AppError(400, 'STATUS_INVALIDO', 'Status de producao invalido.');
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
