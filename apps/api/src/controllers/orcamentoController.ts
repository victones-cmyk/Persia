// apps/api/src/controllers/orcamentoController.ts
// Envio de orçamento ao GestãoClick (SRD §11, Fase 5) — MULTI-ITENS.
// Um orçamento tem 1+ itens (janelas) do mesmo tipo de produto. Cada item vira:
//  • um produto sintético no GC; • uma linha (qtd 1 × valor_final do item) no orçamento.
// Soma das linhas = total exato (RN-10). Recalcula tudo no servidor (nunca confia no cliente).

import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { calcularPersiana } from '../services/calc/persiana';
import {
  isTipoPersiana,
  TIPO_LABEL,
  ACIONAMENTO_LABEL,
  type TipoPersiana,
  type Cor,
  type Acionamento,
} from '../services/calc/tipos';
import { buscarTecidoGc, type TecidoGc } from '../services/gc/tecidos';
import { criarProduto, deletarProduto } from '../services/gc/produtos';
import { criarOrcamento as gcCriarOrcamento, type LinhaProdutoGc } from '../services/gc/orcamentos';
import { roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { AppError } from '../middleware/errorHandler';

/** Entrada de um item (janela) vinda do frontend. */
interface ItemEntrada {
  tecido_id: string;
  cor_acessorio: Cor;
  acionamento: Acionamento;
  largura: number;
  altura: number;
  tc?: number;
  rolamento?: string | null;
  base?: string | null;
}

/** Item já recalculado no servidor, pronto para enviar/salvar. */
interface ItemPreparado {
  tecido: TecidoGc;
  cor_acessorio: Cor;
  acionamento: Acionamento;
  largura: number;
  altura: number;
  tc: number;
  rolamento: string | null;
  base: string | null;
  qtd_venda: number;
  qtd_producao: number;
  valor_bruto: number;
  valor_final: number;
  valor_custo: number;
  componentes: { grupo: string; descricao: string; quantidade: number; unidade: string }[];
  nome_produto: string;
}

/** Snapshot persistido em itens_json (independe do GC para reenvio/exibição). */
interface ItemSnapshot {
  tecido_codigo_gc: string;
  tecido_nome: string;
  dimensao_m: number;
  largura_m: number;
  altura_m: number;
  tc_m: number;
  cor_acessorio: string;
  acionamento: string;
  rolamento: string | null;
  base: string | null;
  qtd_venda: number;
  qtd_producao: number;
  valor_bruto: number;
  valor_final: number;
  valor_custo: number;
  gc_produto_id: string | null;
  nome_produto: string;
  componentes: { grupo: string; descricao: string; quantidade: number; unidade: string }[];
}

function nomeProdutoGc(tipo: TipoPersiana, it: { tecido_nome: string; largura: number; altura: number; cor_acessorio: string; acionamento: Acionamento }): string {
  return `${TIPO_LABEL[tipo]} - ${it.tecido_nome} - ${it.largura.toFixed(2)}x${it.altura.toFixed(2)} - ${it.cor_acessorio} - ${ACIONAMENTO_LABEL[it.acionamento]}`.slice(0, 120);
}

/** Recalcula cada item no servidor. Sem desconto: o valor cheio vai ao GestãoClick. */
function prepararItens(tipo: TipoPersiana, itens: ItemEntrada[], tecidos: Map<string, TecidoGc>): {
  preparados: ItemPreparado[];
  valorBrutoTotal: number;
} {
  const preparados: ItemPreparado[] = [];
  let valorBrutoTotal = 0;

  for (const it of itens) {
    const tecido = tecidos.get(String(it.tecido_id));
    if (!tecido) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido em todos os itens.');
    const largura = Number(it.largura);
    const altura = Number(it.altura);
    if (!(largura > 0) || !(altura > 0)) {
      throw new AppError(400, 'MEDIDAS_INVALIDAS', 'Largura e altura devem ser positivas em todos os itens.');
    }

    const calc = calcularPersiana({
      tipo,
      largura,
      altura,
      dimensao: tecido.dimensao_m,
      cor_acessorio: it.cor_acessorio,
      acionamento: it.acionamento,
      tc: it.tc !== undefined && it.tc !== null ? Number(it.tc) : undefined,
      preco_tecido: tecido.preco_venda,
    });

    const valorBruto = calc.valor_bruto!;
    const valorCusto = roundHalfUp(calc.qtd_venda * tecido.preco_custo);
    valorBrutoTotal = roundHalfUp(valorBrutoTotal + valorBruto);

    preparados.push({
      tecido,
      cor_acessorio: it.cor_acessorio,
      acionamento: it.acionamento,
      largura,
      altura,
      tc: calc.tc,
      rolamento: it.rolamento ?? null,
      base: it.base ?? null,
      qtd_venda: calc.qtd_venda,
      qtd_producao: calc.qtd_producao,
      valor_bruto: valorBruto,
      valor_final: valorBruto, // sem desconto: valor cheio vai ao GC
      valor_custo: valorCusto,
      componentes: calc.componentes,
      nome_produto: nomeProdutoGc(tipo, { tecido_nome: tecido.nome, largura, altura, cor_acessorio: it.cor_acessorio, acionamento: it.acionamento }),
    });
  }

  return { preparados, valorBrutoTotal };
}

/** Resolve a loja interna + gc_loja_id para o usuário (admin → loja matriz/SP). */
export async function resolverLoja(lojaIdUsuario: string | null) {
  if (lojaIdUsuario) {
    const loja = await prisma.loja.findUnique({ where: { id: lojaIdUsuario } });
    if (loja) return loja;
  }
  const matriz = await prisma.loja.findFirst({ orderBy: { nome: 'asc' } });
  if (!matriz) throw new AppError(500, 'SEM_LOJA', 'Nenhuma loja cadastrada.');
  return matriz;
}

/**
 * Cria N produtos no GC e 1 orçamento com N linhas. Em qualquer falha,
 * remove TODOS os produtos já criados (best-effort) para não poluir o GC.
 * Retorna os gc_produto_id na MESMA ORDEM dos itens.
 */
async function executarEnvioGc(args: {
  itens: { nome_produto: string; valor_final: number; valor_custo: number }[];
  gc_cliente_id: string;
  gcVendedorId: string | null;
  gcLojaId: string | null;
}): Promise<{ gc_orcamento_id: string; gc_codigo: string; gc_produto_ids: string[]; payload: object; resposta: unknown }> {
  const criados: string[] = [];
  try {
    const linhas: LinhaProdutoGc[] = [];
    for (const it of args.itens) {
      const produto = await criarProduto({
        nome: it.nome_produto,
        valor_custo: it.valor_custo,
        valor_venda: it.valor_final,
      });
      criados.push(produto.gc_produto_id);
      linhas.push({ gc_produto_id: produto.gc_produto_id, valor_venda: it.valor_final, valor_custo: it.valor_custo });
    }

    const codigo = Math.floor(Date.now() / 1000); // = Nº exibido no GestãoClick
    const orc = await gcCriarOrcamento({
      codigo,
      cliente_id: args.gc_cliente_id,
      produtos: linhas,
      data: new Date().toISOString().slice(0, 10),
      usuario_id: env.GC_USUARIO_INTEGRACAO_ID || null,
      vendedor_id: args.gcVendedorId,
      loja_id: args.gcLojaId,
    });

    return {
      gc_orcamento_id: orc.gc_orcamento_id,
      gc_codigo: String(codigo),
      gc_produto_ids: criados,
      payload: orc.payload,
      resposta: orc.resposta,
    };
  } catch (err) {
    for (const id of criados) {
      try {
        await deletarProduto(id);
      } catch {
        /* ignora falha de limpeza */
      }
    }
    throw err;
  }
}

function snapshotsDe(preparados: ItemPreparado[], gcProdutoIds: string[]): ItemSnapshot[] {
  return preparados.map((p, i) => ({
    tecido_codigo_gc: p.tecido.id,
    tecido_nome: p.tecido.nome,
    dimensao_m: p.tecido.dimensao_m,
    largura_m: p.largura,
    altura_m: p.altura,
    tc_m: p.tc,
    cor_acessorio: p.cor_acessorio,
    acionamento: p.acionamento,
    rolamento: p.rolamento,
    base: p.base,
    qtd_venda: p.qtd_venda,
    qtd_producao: p.qtd_producao,
    valor_bruto: p.valor_bruto,
    valor_final: p.valor_final,
    valor_custo: p.valor_custo,
    gc_produto_id: gcProdutoIds[i] ?? null,
    nome_produto: p.nome_produto,
    componentes: p.componentes,
  }));
}

export async function criarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const b = req.body ?? {};

  if (!isTipoPersiana(b.tipo)) throw new AppError(400, 'TIPO_INVALIDO', 'Tipo de persiana inválido.');
  const tipo = b.tipo as TipoPersiana;
  const itensEntrada: ItemEntrada[] = Array.isArray(b.itens) ? b.itens : [];
  if (itensEntrada.length === 0) throw new AppError(400, 'SEM_ITENS', 'Adicione ao menos um item ao orçamento.');

  // apenas_salvar = rascunho local (não envia ao GestãoClick; cliente opcional).
  const apenasSalvar = b.apenas_salvar === true;
  if (!apenasSalvar && (!b.gc_cliente_id || !b.nome_cliente)) {
    throw new AppError(400, 'CLIENTE_OBRIGATORIO', 'Selecione um cliente.');
  }

  // Busca todos os tecidos referenciados (de uma vez).
  const tecidos = new Map<string, TecidoGc>();
  for (const it of itensEntrada) {
    const id = String(it.tecido_id);
    if (!tecidos.has(id)) {
      const t = await buscarTecidoGc(id);
      if (!t) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido em todos os itens.');
      tecidos.set(id, t);
    }
  }

  const { preparados, valorBrutoTotal } = prepararItens(tipo, itensEntrada, tecidos);
  const loja = await resolverLoja(sessao.loja_id);
  const primeiro = preparados[0];

  // Campos comuns ao salvar (sucesso ou erro). Colunas single = 1º item (compat).
  const baseDados = {
    tipo_produto: tipo,
    usuario_id: sessao.id,
    loja_id: loja.id,
    nome_cliente: b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)',
    gc_cliente_id: b.gc_cliente_id ? String(b.gc_cliente_id) : null,
    tecido_codigo_gc: primeiro.tecido.id,
    tecido_nome: preparados.length > 1 ? `${primeiro.tecido.nome} (+${preparados.length - 1})` : primeiro.tecido.nome,
    largura_m: primeiro.largura,
    altura_m: primeiro.altura,
    dimensao_m: primeiro.tecido.dimensao_m,
    tc_m: primeiro.tc,
    acionamento: primeiro.acionamento,
    cor_acessorio: primeiro.cor_acessorio,
    rolamento: primeiro.rolamento,
    valor_bruto: valorBrutoTotal,
    desconto_pct: 0, // sem desconto na calculadora (controlado no GestãoClick)
    valor_final: valorBrutoTotal,
    desconto_aprovado_por: null,
  };

  // Apenas salvar: grava rascunho local, sem tocar no GestãoClick.
  if (apenasSalvar) {
    const orcamento = await prisma.orcamento.create({
      data: {
        ...baseDados,
        status: 'rascunho',
        itens_json: snapshotsDe(preparados, []) as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.logAcao.create({
      data: { usuario_id: sessao.id, acao: 'orcamento_salvo_rascunho', detalhe: { orcamento_id: orcamento.id, itens: preparados.length, valor_final: valorBrutoTotal } },
    });
    res.status(201).json({ orcamento });
    return;
  }

  try {
    const envio = await executarEnvioGc({
      itens: preparados.map((p) => ({ nome_produto: p.nome_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
      gc_cliente_id: String(b.gc_cliente_id),
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });

    const snapshots = snapshotsDe(preparados, envio.gc_produto_ids);
    const orcamento = await prisma.orcamento.create({
      data: {
        ...baseDados,
        status: 'enviado',
        gc_produto_id: envio.gc_produto_ids[0] ?? null,
        gc_orcamento_id: envio.gc_orcamento_id,
        gc_codigo: envio.gc_codigo,
        itens_json: snapshots as unknown as Prisma.InputJsonValue,
        payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
        resposta_gc: envio.resposta as Prisma.InputJsonValue,
      },
    });

    await prisma.logAcao.create({
      data: {
        usuario_id: sessao.id,
        acao: 'orcamento_enviado_gc',
        detalhe: { orcamento_id: orcamento.id, gc_orcamento_id: envio.gc_orcamento_id, itens: preparados.length, valor_final: valorBrutoTotal },
      },
    });
    res.status(201).json({ orcamento });
  } catch (err) {
    const gc = err instanceof GcError ? err : null;
    const snapshots = snapshotsDe(preparados, []);
    const orcamento = await prisma.orcamento.create({
      data: {
        ...baseDados,
        status: 'erro',
        itens_json: snapshots as unknown as Prisma.InputJsonValue,
        erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message),
        payload_gc_enviado: (gc?.payload as object) ?? undefined,
      },
    });
    res.status(502).json({
      orcamento,
      erro: {
        codigo: gc?.status === 401 ? 'GC_AUTH' : 'GC_ERRO',
        status: gc?.status ?? 0,
        message: gc?.message ?? 'Falha ao enviar ao GestãoClick.',
      },
    });
  }
}

/** Reconstrói os itens preparados a partir do snapshot salvo (para reenvio). */
function preparadosDoSnapshot(snaps: ItemSnapshot[]): { nome_produto: string; valor_final: number; valor_custo: number }[] {
  return snaps.map((s) => ({ nome_produto: s.nome_produto, valor_final: Number(s.valor_final), valor_custo: Number(s.valor_custo) }));
}

export async function reenviarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({ where: { id: String(req.params.id) } });
  if (!orc) throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  if (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id) {
    throw new AppError(403, 'ACESSO_NEGADO', 'Sem permissão para reenviar este orçamento.');
  }
  if (!orc.gc_cliente_id) throw new AppError(400, 'SEM_CLIENTE', 'Orçamento sem cliente vinculado.');

  const snaps = (orc.itens_json as unknown as ItemSnapshot[] | null) ?? [];
  if (snaps.length === 0) throw new AppError(400, 'SEM_ITENS', 'Orçamento sem itens para reenviar.');

  const loja = await resolverLoja(orc.loja_id);

  try {
    const envio = await executarEnvioGc({
      itens: preparadosDoSnapshot(snaps),
      gc_cliente_id: orc.gc_cliente_id,
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });

    const novosSnaps = snaps.map((s, i) => ({ ...s, gc_produto_id: envio.gc_produto_ids[i] ?? null }));
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: {
        status: 'enviado',
        gc_produto_id: envio.gc_produto_ids[0] ?? null,
        gc_orcamento_id: envio.gc_orcamento_id,
        gc_codigo: envio.gc_codigo,
        itens_json: novosSnaps as unknown as Prisma.InputJsonValue,
        payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
        resposta_gc: envio.resposta as Prisma.InputJsonValue,
        erro_gc: null,
      },
    });
    await prisma.logAcao.create({
      data: { usuario_id: sessao.id, acao: 'orcamento_reenviado', detalhe: { orcamento_id: orc.id } },
    });
    res.json({ orcamento: atualizado });
  } catch (err) {
    const gc = err instanceof GcError ? err : null;
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: { status: 'erro', erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message) },
    });
    res.status(502).json({
      orcamento: atualizado,
      erro: { codigo: gc?.status === 401 ? 'GC_AUTH' : 'GC_ERRO', message: gc?.message ?? 'Falha no reenvio.' },
    });
  }
}

/** GET /api/orcamentos — lista paginada (20/pág), filtros status e cliente. Vendedor vê só os seus. */
export async function listarOrcamentos(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const pagina = Math.max(1, Number(req.query.pagina ?? 1));
  const porPagina = 20;
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const cliente = typeof req.query.cliente === 'string' ? req.query.cliente.trim() : '';

  const where: Prisma.OrcamentoWhereInput = {};
  if (sessao.perfil !== 'admin') where.usuario_id = sessao.id;
  if (['rascunho', 'enviado', 'erro', 'cancelado'].includes(status)) {
    where.status = status as Prisma.EnumStatusOrcamentoFilter['equals'];
  }
  if (cliente) where.nome_cliente = { contains: cliente, mode: 'insensitive' };

  const [total, orcamentos] = await Promise.all([
    prisma.orcamento.count({ where }),
    prisma.orcamento.findMany({
      where,
      orderBy: { criado_em: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      include: { usuario: { select: { nome: true } }, loja: { select: { nome: true } } },
    }),
  ]);

  res.json({
    orcamentos,
    paginacao: { pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) },
  });
}

/** POST /api/orcamentos/:id/cancelar — soft delete (status=cancelado). Não toca no GestãoClick. */
export async function cancelarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({ where: { id: String(req.params.id) } });
  if (!orc) throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  if (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id) {
    throw new AppError(403, 'ACESSO_NEGADO', 'Sem permissão.');
  }
  const atualizado = await prisma.orcamento.update({
    where: { id: orc.id },
    data: { status: 'cancelado' },
  });
  res.json({ orcamento: atualizado });
}

export async function getOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({
    where: { id: String(req.params.id) },
    include: { itens: true, loja: true },
  });
  if (!orc) throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  if (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id) {
    throw new AppError(403, 'ACESSO_NEGADO', 'Sem permissão.');
  }
  res.json({ orcamento: orc });
}
