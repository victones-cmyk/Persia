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
import { criarOrcamento as gcCriarOrcamento, type LinhaProdutoGc, type LinhaServicoGc } from '../services/gc/orcamentos';
import { roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { AppError } from '../middleware/errorHandler';
import { resolverLoja } from '../lib/resolverLoja';
import { reenviarCortina, resolverServicoInstalacao } from './orcamentoCortinaController';
import { reenviarMisto } from './orcamentoMistoController';

/** Entrada de um item (janela) vinda do frontend. */
export interface ItemEntrada {
  ambiente?: string;
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
  ambiente: string;
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
export interface ItemSnapshot {
  ambiente: string;
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

function nomeProdutoGc(tipo: TipoPersiana, it: { ambiente?: string; tecido_nome: string; largura: number; altura: number; cor_acessorio: string; acionamento: Acionamento }): string {
  const amb = it.ambiente?.trim() ? ` - ${it.ambiente.trim()}` : '';
  return `${TIPO_LABEL[tipo]}${amb} - ${it.tecido_nome} - ${it.largura.toFixed(2)}x${it.altura.toFixed(2)} - ${it.cor_acessorio} - ${ACIONAMENTO_LABEL[it.acionamento]}`.slice(0, 120);
}

/** Recalcula cada item no servidor. Sem desconto: o valor cheio vai ao GestãoClick. */
export function prepararItens(tipo: TipoPersiana, itens: ItemEntrada[], tecidos: Map<string, TecidoGc>): {
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

    const ambiente = it.ambiente?.trim() || '';
    preparados.push({
      ambiente,
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
      nome_produto: nomeProdutoGc(tipo, { ambiente, tecido_nome: tecido.nome, largura, altura, cor_acessorio: it.cor_acessorio, acionamento: it.acionamento }),
    });
  }

  return { preparados, valorBrutoTotal };
}

/**
 * Cria N produtos no GC e 1 orçamento com N linhas. Em qualquer falha,
 * remove TODOS os produtos já criados (best-effort) para não poluir o GC.
 * Retorna os gc_produto_id na MESMA ORDEM dos itens.
 */
export async function executarEnvioGc(args: {
  itens: { nome_produto: string; valor_final: number; valor_custo: number }[];
  instalacao_por_peca?: number; // valor unitário da instalação (por peça/janela)
  pecas?: number; // nº de peças (= nº de itens) para a instalação
  gc_cliente_id: string;
  gcVendedorId: string | null;
  gcLojaId: string | null;
}): Promise<{ gc_orcamento_id: string; gc_codigo: string | null; gc_produto_ids: string[]; payload: object; resposta: unknown }> {
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

    // Instalação POR PEÇA (Victor v.3.1): 1 linha de serviço com qtd = nº de peças.
    const servicos: LinhaServicoGc[] = [];
    const instalacaoPorPeca = Math.max(0, Number(args.instalacao_por_peca) || 0);
    const pecas = Math.max(0, Number(args.pecas) || 0);
    if (instalacaoPorPeca > 0 && pecas > 0) {
      const servicoId = await resolverServicoInstalacao(undefined);
      if (!servicoId) throw new AppError(400, 'SERVICO_INSTALACAO', 'Nenhum serviço de instalação encontrado no GestãoClick.');
      servicos.push({ gc_servico_id: servicoId, valor_venda: instalacaoPorPeca, quantidade: pecas });
    }

    // Não enviamos número: o GestãoClick gera o sequencial e devolve em orc.gc_codigo.
    const orc = await gcCriarOrcamento({
      cliente_id: args.gc_cliente_id,
      produtos: linhas,
      servicos,
      data: new Date().toISOString().slice(0, 10),
      usuario_id: env.GC_USUARIO_INTEGRACAO_ID || null,
      vendedor_id: args.gcVendedorId,
      loja_id: args.gcLojaId,
    });

    return {
      gc_orcamento_id: orc.gc_orcamento_id,
      gc_codigo: orc.gc_codigo,
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

export function snapshotsDe(preparados: ItemPreparado[], gcProdutoIds: string[]): ItemSnapshot[] {
  return preparados.map((p, i) => ({
    ambiente: p.ambiente,
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

  // editar_id = reabrir um rascunho na calculadora e regravar no MESMO registro.
  const editarId = typeof b.editar_id === 'string' && b.editar_id ? b.editar_id : null;
  let editarOrc = null as Awaited<ReturnType<typeof prisma.orcamento.findUnique>>;
  if (editarId) {
    editarOrc = await prisma.orcamento.findUnique({ where: { id: editarId } });
    if (!editarOrc) throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
    if (sessao.perfil !== 'admin' && editarOrc.usuario_id !== sessao.id) throw new AppError(403, 'ACESSO_NEGADO', 'Sem permissão para editar este orçamento.');
    if (editarOrc.status !== 'rascunho') throw new AppError(400, 'NAO_EDITAVEL', 'Só é possível editar orçamentos em rascunho.');
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
  const loja = await resolverLoja(editarOrc?.loja_id ?? sessao.loja_id);
  const primeiro = preparados[0];

  // Instalação POR PEÇA (Victor v.3.1): valor unitário × nº de peças (= nº de itens).
  const instalacaoPorPeca = Math.max(0, Number(b.instalacao_valor) || 0);
  const pecas = preparados.length;
  const valorInstalacao = roundHalfUp(instalacaoPorPeca * pecas);
  const valorTotal = roundHalfUp(valorBrutoTotal + valorInstalacao);

  // Entrada bruta — permite reabrir o rascunho na calculadora. instalacao_valor = POR PEÇA.
  const entradaJson = { tipo, itens: itensEntrada, instalacao_valor: instalacaoPorPeca } as unknown as Prisma.InputJsonValue;

  // Grava: cria novo ou atualiza o rascunho em edição (mesmo registro).
  const persistir = (data: Prisma.OrcamentoUncheckedCreateInput) =>
    editarId
      ? prisma.orcamento.update({ where: { id: editarId }, data: data as Prisma.OrcamentoUncheckedUpdateInput })
      : prisma.orcamento.create({ data });

  // Campos comuns ao salvar (sucesso ou erro). Colunas single = 1º item (compat).
  const baseDados = {
    tipo_produto: tipo,
    usuario_id: editarOrc?.usuario_id ?? sessao.id,
    loja_id: editarOrc?.loja_id ?? loja.id,
    entrada_json: entradaJson,
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
    valor_final: valorTotal, // itens + instalação
    desconto_aprovado_por: null,
  };

  // Apenas salvar: grava rascunho local, sem tocar no GestãoClick.
  if (apenasSalvar) {
    const orcamento = await persistir({
      ...baseDados,
      status: 'rascunho',
      itens_json: snapshotsDe(preparados, []) as unknown as Prisma.InputJsonValue,
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
      instalacao_por_peca: instalacaoPorPeca,
      pecas,
      gc_cliente_id: String(b.gc_cliente_id),
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });

    const snapshots = snapshotsDe(preparados, envio.gc_produto_ids);
    const orcamento = await persistir({
      ...baseDados,
      status: 'enviado',
      gc_produto_id: envio.gc_produto_ids[0] ?? null,
      gc_orcamento_id: envio.gc_orcamento_id,
      gc_codigo: envio.gc_codigo,
      itens_json: snapshots as unknown as Prisma.InputJsonValue,
      payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
      resposta_gc: envio.resposta as Prisma.InputJsonValue,
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
    const orcamento = await persistir({
      ...baseDados,
      status: 'erro',
      itens_json: snapshots as unknown as Prisma.InputJsonValue,
      erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message),
      payload_gc_enviado: (gc?.payload as object as Prisma.InputJsonValue) ?? undefined,
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

  // Cortina e misto têm montagem própria.
  if (orc.tipo_produto === 'cortina') { await reenviarCortina(orc, sessao, res); return; }
  if (orc.tipo_produto === 'misto') { await reenviarMisto(orc, sessao, res); return; }

  const snaps = (orc.itens_json as unknown as ItemSnapshot[] | null) ?? [];
  if (snaps.length === 0) throw new AppError(400, 'SEM_ITENS', 'Orçamento sem itens para reenviar.');

  const loja = await resolverLoja(orc.loja_id);
  const instalacaoPorPeca = Math.max(0, Number((orc.entrada_json as { instalacao_valor?: number } | null)?.instalacao_valor) || 0);

  try {
    const envio = await executarEnvioGc({
      itens: preparadosDoSnapshot(snaps),
      instalacao_por_peca: instalacaoPorPeca,
      pecas: snaps.length,
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

/** PUT /api/orcamentos/:id — edita o cliente de um rascunho/erro (antes de enviar). */
export async function atualizarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({ where: { id: String(req.params.id) } });
  if (!orc) throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  if (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id) throw new AppError(403, 'ACESSO_NEGADO', 'Sem permissão.');
  if (orc.status !== 'rascunho' && orc.status !== 'erro') {
    throw new AppError(400, 'NAO_EDITAVEL', 'Só é possível editar orçamentos em rascunho ou com erro.');
  }
  const b = req.body ?? {};
  const data: Prisma.OrcamentoUpdateInput = {};
  if (b.gc_cliente_id !== undefined) data.gc_cliente_id = b.gc_cliente_id ? String(b.gc_cliente_id) : null;
  if (b.nome_cliente !== undefined) data.nome_cliente = b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)';
  const atualizado = await prisma.orcamento.update({ where: { id: orc.id }, data });
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
