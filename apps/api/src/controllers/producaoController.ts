import type { Request, Response } from 'express';
import { spawn } from 'node:child_process';
import { Prisma, type Orcamento, type OrdemProducao } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';
import {
  gerarPdfOrdemProducao,
  gerarZplEtiqueta,
  type ItemProducaoSnapshot,
  type OrdemDocumento,
} from '../services/producao/documentos';

function temAcesso(orc: Pick<Orcamento, 'usuario_id'>, sessao: Express.Request['session']['usuario']): boolean {
  return Boolean(sessao && (sessao.perfil === 'admin' || orc.usuario_id === sessao.id));
}

interface CortinaSnapshotProducao {
  ambiente?: string;
  modelo?: string;
  fixacao?: string;
  largura?: number;
  altura?: number;
  n_camadas?: number;
  camadas?: Array<{ tecido_nome?: string; metragem?: number; valor_tecido?: number }>;
  acessorios?: Array<{ item?: string; produto_nome?: string; quantidade?: number; preco?: number; subtotal?: number }>;
  valor_total?: number;
  nome_produto?: string;
}

function cortinaParaItem(c: CortinaSnapshotProducao): ItemProducaoSnapshot {
  const tecidos = c.camadas?.map((cam, i) => `${i === 0 ? 'Frente' : `Camada ${i + 1}`}: ${cam.tecido_nome ?? '-'}`).join(' | ');
  return {
    ambiente: c.ambiente,
    tipo: c.modelo,
    tecido_nome: tecidos || c.camadas?.[0]?.tecido_nome,
    largura_m: Number(c.largura ?? 0),
    altura_m: Number(c.altura ?? 0),
    qtd_producao: c.camadas?.[0]?.metragem,
    nome_produto: c.nome_produto ?? `Cortina ${c.modelo ?? ''}`.trim(),
    descricao_produto: [
      c.fixacao ? `Fixacao: ${c.fixacao}` : null,
      c.n_camadas ? `Camadas: ${c.n_camadas}` : null,
      ...(c.camadas ?? []).map((cam, i) => `${i === 0 ? 'Frente' : `Camada ${i + 1}`}: ${cam.tecido_nome ?? '-'} - ${cam.metragem ?? 0} m`),
    ].filter(Boolean).join('\n'),
    componentes: [
      ...(c.camadas ?? []).map((cam, i) => ({
        grupo: 'Tecido',
        descricao: `${i === 0 ? 'Frente' : `Camada ${i + 1}`}: ${cam.tecido_nome ?? '-'}`,
        quantidade: Number(cam.metragem ?? 0),
        unidade: 'm',
      })),
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
  const itens = itensDoOrcamento(orc);
  if (itens.length === 0) throw new AppError(409, 'SEM_ITENS', 'Este orcamento nao possui itens para producao.');

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
      data: { usuario_id: req.session.usuario!.id, acao: 'ordens_producao_criadas', detalhe: { orcamento_id: orc.id, itens: indices } },
    });
    return out;
  });

  res.status(201).json({ ordens: criadas });
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

export async function imprimirEtiquetaOrdem(req: Request, res: Response): Promise<void> {
  const ordem = await carregarOrdemAutorizada(req);
  const zpl = gerarZplEtiqueta(ordemParaDocumento(ordem, ordem.orcamento), env.ZEBRA_DPI);
  await imprimirRawCups(zpl);
  const atualizada = await prisma.ordemProducao.update({
    where: { id: ordem.id },
    data: { status: 'impressa', impresso_em: new Date() },
  });
  await prisma.logAcao.create({
    data: { usuario_id: req.session.usuario!.id, acao: 'etiqueta_ordem_impressa', detalhe: { ordem_id: ordem.id, codigo: ordem.codigo, impressora: env.ZEBRA_PRINTER_NAME } },
  });
  res.json({ ordem: atualizada });
}
