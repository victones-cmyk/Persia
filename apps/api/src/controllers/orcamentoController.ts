// apps/api/src/controllers/orcamentoController.ts
// Envio de orçamento ao GestãoClick (SRD §11, Fase 5) — MULTI-ITENS.
// Um orçamento tem 1+ itens (janelas) do mesmo tipo de produto. Cada item vira:
//  • um produto sintético no GC; • uma linha (qtd 1 × valor_final do item) no orçamento.
// Soma das linhas = total exato (RN-10). Recalcula tudo no servidor (nunca confia no cliente).

import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ReceitaPendenteError } from '../services/calc/persianaPreco';
import { precoPersianaItem, mapasDePrecoComponentes, componentesSnapshot } from '../services/calc/persianaPrecoGc';
import { componenteInstalacao } from '../services/calc/instalacaoCalc';
import { valorComRt, componenteRt } from '../services/calc/rtCalc';
import { indiceInstalacoes } from '../services/gc/instalacao';
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
import { resolverLoja } from '../lib/resolverLoja';
import { reenviarCortina } from './orcamentoCortinaController';
import { reenviarMisto } from './orcamentoMistoController';

/** Entrada de um item (janela) vinda do frontend. */
export interface ItemEntrada {
  ambiente?: string;
  tipo?: TipoPersiana; // produto sob medida POR ITEM (Victor 26/06/2026); cai p/ tipo do orçamento se ausente
  tecido_id: string;
  cor_acessorio: Cor;
  acionamento: Acionamento;
  largura: number;
  altura: number;
  tc?: number;
  rolamento?: string | null;
  base?: string | null;
  instalacao_id?: string | null; // tipo de instalação (grupo INSTALAÇÃO) embutido no produto
}

/** Item já recalculado no servidor, pronto para enviar/salvar. */
interface ItemPreparado {
  ambiente: string;
  tipo: TipoPersiana;
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
  instalacao_id: string | null;
  instalacao_nome: string | null;
  componentes: { grupo: string; descricao: string; quantidade: number; unidade: string }[];
  nome_produto: string;
}

/** Snapshot persistido em itens_json (independe do GC para reenvio/exibição). */
export interface ItemSnapshot {
  ambiente: string;
  tipo: TipoPersiana;
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
  instalacao_id: string | null;
  instalacao_nome: string | null;
  gc_produto_id: string | null;
  nome_produto: string;
  componentes: { grupo: string; descricao: string; quantidade: number; unidade: string }[];
}

function nomeProdutoGc(tipo: TipoPersiana, it: { ambiente?: string; tecido_nome: string; largura: number; altura: number; cor_acessorio: string; acionamento: Acionamento }): string {
  // Victor (v.4.1): o AMBIENTE vem na frente do nome do produto. Ex.: "SALA, Persiana ...".
  const amb = it.ambiente?.trim() ? `${it.ambiente.trim()}, ` : '';
  return `${amb}${TIPO_LABEL[tipo]} - ${it.tecido_nome} - ${it.largura.toFixed(2)}x${it.altura.toFixed(2)} - ${it.cor_acessorio} - ${ACIONAMENTO_LABEL[it.acionamento]}`.slice(0, 120);
}

/**
 * Recalcula cada item no servidor com o MOTOR DE COMPONENTES (preços do GestãoClick).
 * valor = soma de todos os componentes + tecido + INSTALAÇÃO, a VAREJO (Victor). A
 * instalação (grupo INSTALAÇÃO) entra embutida no produto. O tipo de persiana é POR
 * ITEM (`tipoFallback` cobre rascunhos antigos com tipo único). Sem desconto: o valor
 * cheio vai ao GestãoClick. Async porque busca preços de componentes/instalação no GC.
 */
export async function prepararItens(tipoFallback: TipoPersiana | null, itens: ItemEntrada[], tecidos: Map<string, TecidoGc>): Promise<{
  preparados: ItemPreparado[];
  valorBrutoTotal: number;
}> {
  const { precos, custos } = await mapasDePrecoComponentes();
  const idxInst = await indiceInstalacoes();
  const preparados: ItemPreparado[] = [];
  let valorBrutoTotal = 0;

  for (const it of itens) {
    const tipo = isTipoPersiana(it.tipo ?? '') ? (it.tipo as TipoPersiana) : tipoFallback;
    if (!tipo) throw new AppError(400, 'TIPO_INVALIDO', 'Selecione o produto sob medida de todos os itens.');
    const tecido = tecidos.get(String(it.tecido_id));
    if (!tecido) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido em todos os itens.');
    const largura = Number(it.largura);
    const altura = Number(it.altura);
    if (!(largura > 0) || !(altura > 0)) {
      throw new AppError(400, 'MEDIDAS_INVALIDAS', 'Largura e altura devem ser positivas em todos os itens.');
    }
    // RN-01: largura não pode exceder a largura do rolo do tecido.
    if (largura > tecido.dimensao_m) {
      throw new AppError(400, 'RN01_LARGURA_EXCEDIDA', `O tecido ${tecido.nome} suporta até ${tecido.dimensao_m.toFixed(2).replace('.', ',')} m.`);
    }

    let item;
    try {
      item = precoPersianaItem({
        tipo,
        acionamento: it.acionamento,
        largura,
        altura,
        tc: it.tc !== undefined && it.tc !== null ? Number(it.tc) : undefined,
        preco_tecido: tecido.preco_venda,
        preco_tecido_custo: tecido.preco_custo,
        precos,
        custos,
      });
    } catch (err) {
      if (err instanceof ReceitaPendenteError) throw new AppError(400, 'RECEITA_PENDENTE', err.message);
      throw err;
    }

    // Instalação embutida (Victor 26/06/2026): soma venda no valor e custo no custo.
    const inst = it.instalacao_id ? idxInst.get(String(it.instalacao_id)) ?? null : null;
    const valorBruto = roundHalfUp(item.valor + (inst?.preco ?? 0));
    const valorCusto = roundHalfUp(item.valor_custo + (inst?.custo ?? 0));
    valorBrutoTotal = roundHalfUp(valorBrutoTotal + valorBruto);

    const componentes = [...componentesSnapshot(item.venda), ...(inst ? [componenteInstalacao(inst)] : [])];

    const ambiente = it.ambiente?.trim() || '';
    preparados.push({
      ambiente,
      tipo,
      tecido,
      cor_acessorio: it.cor_acessorio,
      acionamento: it.acionamento,
      largura,
      altura,
      tc: item.tc,
      rolamento: it.rolamento ?? null,
      base: it.base ?? null,
      qtd_venda: item.venda.tecido.quantidade,
      qtd_producao: item.venda.tecido.quantidade,
      valor_bruto: valorBruto,
      valor_final: valorBruto, // sem desconto: valor cheio vai ao GC
      valor_custo: valorCusto,
      instalacao_id: inst?.id ?? null,
      instalacao_nome: inst?.nome ?? null,
      componentes,
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

    // Instalação (Victor 26/06/2026): NÃO é mais linha de serviço — já está embutida no
    // valor de cada produto (componente). Por isso o envio não tem mais `servicos`.
    // Não enviamos número: o GestãoClick gera o sequencial e devolve em orc.gc_codigo.
    const orc = await gcCriarOrcamento({
      cliente_id: args.gc_cliente_id,
      produtos: linhas,
      servicos: [],
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
    tipo: p.tipo,
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
    instalacao_id: p.instalacao_id,
    instalacao_nome: p.instalacao_nome,
    gc_produto_id: gcProdutoIds[i] ?? null,
    nome_produto: p.nome_produto,
    componentes: p.componentes,
  }));
}

export async function criarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const b = req.body ?? {};

  // Tipo POR ITEM (Victor 26/06/2026): `b.tipo` é só fallback p/ rascunhos antigos.
  const tipoFallback = isTipoPersiana(b.tipo) ? (b.tipo as TipoPersiana) : null;
  const itensEntrada: ItemEntrada[] = Array.isArray(b.itens) ? b.itens : [];
  if (itensEntrada.length === 0) throw new AppError(400, 'SEM_ITENS', 'Adicione ao menos um item ao orçamento.');
  if (!tipoFallback && !itensEntrada.every((it) => isTipoPersiana(it.tipo ?? ''))) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Selecione o produto sob medida de todos os itens.');
  }

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
    // Resposta uniforme p/ inexistente e sem-permissão: não revela orçamento alheio.
    if (!editarOrc || (sessao.perfil !== 'admin' && editarOrc.usuario_id !== sessao.id)) {
      throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
    }
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

  const { preparados, valorBrutoTotal } = await prepararItens(tipoFallback, itensEntrada, tecidos);
  // RT do arquiteto (Victor 27/06/2026): gross-up embutido no valor de venda de cada
  // produto (custo inalterado). % vale para o orçamento todo.
  const rtPct = Math.max(0, Math.min(99, Number(b.rt_pct) || 0));
  if (rtPct > 0) {
    for (const p of preparados) {
      const base = p.valor_final;
      p.valor_final = valorComRt(base, rtPct);
      p.componentes = [...p.componentes, componenteRt(rtPct)];
    }
  }
  const loja = await resolverLoja(editarOrc?.loja_id ?? sessao.loja_id);
  const primeiro = preparados[0];
  // Instalação e RT já estão embutidos no valor de cada item — sem linha à parte.
  const valorTotal = roundHalfUp(preparados.reduce((s, p) => s + p.valor_final, 0));

  // Entrada bruta — permite reabrir o rascunho na calculadora (tipo + instalação + RT).
  const entradaJson = { tipo: primeiro.tipo, itens: itensEntrada, rt_pct: rtPct } as unknown as Prisma.InputJsonValue;

  // Grava: cria novo ou atualiza o rascunho em edição (mesmo registro).
  const persistir = (data: Prisma.OrcamentoUncheckedCreateInput) =>
    editarId
      ? prisma.orcamento.update({ where: { id: editarId }, data: data as Prisma.OrcamentoUncheckedUpdateInput })
      : prisma.orcamento.create({ data });

  // Campos comuns ao salvar (sucesso ou erro). Colunas single = 1º item (compat).
  // tipo_produto = tipo do 1º item (representativo; o tipo real de cada item está em itens_json).
  const baseDados = {
    tipo_produto: primeiro.tipo,
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
    valor_final: valorTotal, // itens (com instalação embutida)
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

/** Reconstrói os itens preparados a partir do snapshot salvo (fallback de reenvio legado). */
function preparadosDoSnapshot(snaps: ItemSnapshot[]): { nome_produto: string; valor_final: number; valor_custo: number }[] {
  return snaps.map((s) => ({ nome_produto: s.nome_produto, valor_final: Number(s.valor_final), valor_custo: Number(s.valor_custo) }));
}

/**
 * Recalcula os itens de persiana a partir da ENTRADA salva (`entrada_json`), sem
 * confiar nos valores do snapshot. Usado no reenvio para garantir que o que vai ao
 * GestãoClick é sempre derivado de recálculo no servidor com preços atuais (RN-10).
 */
export async function recalcularPersianasDeEntrada(
  tipoFallback: TipoPersiana | null,
  itens: ItemEntrada[],
  rtPct: number,
): Promise<ItemPreparado[]> {
  const tecidos = new Map<string, TecidoGc>();
  for (const it of itens) {
    const id = String(it.tecido_id);
    if (!tecidos.has(id)) {
      const t = await buscarTecidoGc(id);
      if (!t) throw new AppError(400, 'TECIDO_INVALIDO', 'Tecido não encontrado ao recalcular o orçamento.');
      tecidos.set(id, t);
    }
  }
  const { preparados } = await prepararItens(tipoFallback, itens, tecidos);
  const pct = Math.max(0, Math.min(99, Number(rtPct) || 0));
  if (pct > 0) {
    for (const p of preparados) {
      p.valor_final = valorComRt(p.valor_final, pct);
      p.componentes = [...p.componentes, componenteRt(pct)];
    }
  }
  return preparados;
}

export async function reenviarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({ where: { id: String(req.params.id) } });
  if (!orc || (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  }
  if (!orc.gc_cliente_id) throw new AppError(400, 'SEM_CLIENTE', 'Orçamento sem cliente vinculado.');

  // Cortina e misto têm montagem própria.
  if (orc.tipo_produto === 'cortina') { await reenviarCortina(orc, sessao, res); return; }
  if (orc.tipo_produto === 'misto') { await reenviarMisto(orc, sessao, res); return; }

  const entrada = orc.entrada_json as { tipo?: string; itens?: ItemEntrada[]; rt_pct?: number } | null;
  const recalcular = Array.isArray(entrada?.itens) && entrada!.itens!.length > 0;
  const snaps = (orc.itens_json as unknown as ItemSnapshot[] | null) ?? [];
  if (!recalcular && snaps.length === 0) throw new AppError(400, 'SEM_ITENS', 'Orçamento sem itens para reenviar.');

  const loja = await resolverLoja(orc.loja_id);

  try {
    // Recalcula a partir da entrada (preferido); cai para o snapshot só em registros legados.
    const preparados = recalcular
      ? await recalcularPersianasDeEntrada(
          isTipoPersiana(entrada!.tipo ?? '') ? (entrada!.tipo as TipoPersiana) : null,
          entrada!.itens!,
          Number(entrada!.rt_pct) || 0,
        )
      : null;

    const envio = await executarEnvioGc({
      itens: preparados
        ? preparados.map((p) => ({ nome_produto: p.nome_produto, valor_final: p.valor_final, valor_custo: p.valor_custo }))
        : preparadosDoSnapshot(snaps),
      gc_cliente_id: orc.gc_cliente_id,
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });

    const novosSnaps = preparados
      ? snapshotsDe(preparados, envio.gc_produto_ids)
      : snaps.map((s, i) => ({ ...s, gc_produto_id: envio.gc_produto_ids[i] ?? null }));
    const novoTotal = preparados ? roundHalfUp(preparados.reduce((s, p) => s + p.valor_final, 0)) : null;

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
        ...(novoTotal !== null ? { valor_bruto: novoTotal, valor_final: novoTotal } : {}),
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
  if (!orc || (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
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
  if (!orc || (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  }
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
    include: { loja: true },
  });
  if (!orc || (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  }
  res.json({ orcamento: orc });
}
