// apps/api/src/controllers/orcamentoController.ts
// Envio de orçamento ao GestãoClick (SRD §11, Fase 5) — MULTI-ITENS.
// Um orçamento tem 1+ itens (janelas) do mesmo tipo de produto. Cada item vira:
//  • um produto sintético no GC; • uma linha (qtd 1 × valor_final do item) no orçamento.
// Soma das linhas = total exato (RN-10). Recalcula tudo no servidor (nunca confia no cliente).

import type { Request, Response } from 'express';
import { Prisma, TipoProduto } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ReceitaPendenteError } from '../services/calc/persianaPreco';
import { precoPersianaItem, mapasDePrecoComponentes, componentesSnapshot } from '../services/calc/persianaPrecoGc';
import { componenteInstalacao } from '../services/calc/instalacaoCalc';
import { valorComRt, componenteRt } from '../services/calc/rtCalc';
import { valorComDesconto, componenteDesconto } from '../services/calc/descontoCalc';
import { encontrarCalculadora, exigeLarguraTecido } from '../services/calc/calculadoras';
import { verificarAcessoCalculadora, clienteGcDaRevenda } from '../lib/permissaoRevenda';

import { indiceInstalacoes } from '../services/gc/instalacao';
import {
  isTipoPersiana,
  TIPO_LABEL,
  type TipoPersiana,
  type Cor,
  type Acionamento,
} from '../services/calc/tipos';
import { descricaoProdutoPersiana, nomeProdutoPersiana } from '../services/calc/persianaProduto';
import { buscarTecidoGc, type TecidoGc } from '../services/gc/tecidos';
import { criarProduto, deletarProduto } from '../services/gc/produtos';
import { inativarProdutosSinteticosDoOrcamento, respostaComProdutosCriados } from '../services/gc/limpezaProdutos';
import { criarOrcamento as gcCriarOrcamento, montarPayload, type LinhaProdutoGc, type NovoOrcamentoGc } from '../services/gc/orcamentos';
import { criarVendaDePayload } from '../services/gc/vendas';
import { roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { AppError } from '../middleware/errorHandler';
import { resolverLoja } from '../lib/resolverLoja';
import { validarDataEntrega } from '../lib/validarPedido';
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
  comando?: string | null;
  bando_codigo?: string | null;
  bando_nome?: string | null;
  emissor?: boolean | null;
  emissor_codigo?: string | null;
  emissor_nome?: string | null;
  canal?: string | null;
  fixacao_instalacao?: string | null;
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
  comando: string | null;
  bando_codigo: string | null;
  bando_nome: string | null;
  emissor: boolean;
  emissor_codigo: string | null;
  emissor_nome: string | null;
  canal: string | null;
  fixacao_instalacao: string | null;
  qtd_venda: number;
  qtd_producao: number;
  valor_bruto: number;
  valor_final: number;
  valor_custo: number;
  instalacao_id: string | null;
  instalacao_nome: string | null;
  componentes: { grupo: string; descricao: string; quantidade: number; unidade: string; produto_id?: string | null }[];
  nome_produto: string;
  descricao_produto: string;
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
  comando: string | null;
  bando_codigo?: string | null;
  bando_nome?: string | null;
  emissor?: boolean | null;
  emissor_codigo?: string | null;
  emissor_nome?: string | null;
  canal?: string | null;
  fixacao_instalacao?: string | null;
  qtd_venda: number;
  qtd_producao: number;
  valor_bruto: number;
  valor_final: number;
  valor_custo: number;
  instalacao_id: string | null;
  instalacao_nome: string | null;
  gc_produto_id: string | null;
  nome_produto: string;
  descricao_produto?: string;
  componentes: { grupo: string; descricao: string; quantidade: number; unidade: string; produto_id?: string | null }[];
}

function erroGcLegivel(erro: string | null | undefined): string | null {
  if (!erro) return erro ?? null;
  if (!/<html[\s>]|<!doctype html/i.test(erro)) return erro;
  const codigo = erro.match(/Error code\s*(\d{3})/i)?.[1] ?? erro.match(/HTTP\s*(\d{3})/i)?.[1] ?? '5xx';
  const host = erro.match(/<span[^>]*>\s*([^<]*\.[^<]*)\s*<\/span>\s*<h3[^>]*>[\s\S]*?Host/i)?.[1]?.trim()
    ?? erro.match(/campaign=([^"&]+).*?Host/i)?.[1]?.trim()
    ?? null;
  const alvo = host ? ` (${host})` : '';
  return `GestãoClick indisponível${alvo}: servidor retornou HTTP ${codigo}. Tente reenviar em alguns minutos.`;
}

function normalizarErroOrcamento<T extends { erro_gc?: string | null }>(orc: T): T {
  return { ...orc, erro_gc: erroGcLegivel(orc.erro_gc) };
}

function produtoSobMedidaLabel(tipo: TipoPersiana): string {
  return encontrarCalculadora(tipo)?.nome ?? TIPO_LABEL[tipo] ?? tipo;
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
  const { precos, custos, componentesPorNome, produtoIds } = await mapasDePrecoComponentes();
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
    if (exigeLarguraTecido(tipo) && largura > tecido.dimensao_m) {
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
        componentesPorNome,
        produtoIds,
        componente_bando: it.bando_codigo ? { codigo_interno: String(it.bando_codigo), descricao: String(it.bando_nome || 'Bando') } : null,
        cor_acessorio: it.cor_acessorio,
        cor_base: (it.base || it.cor_acessorio) as Cor,
        emissor: Boolean(it.emissor),
        componente_emissor: it.emissor && it.emissor_codigo ? { codigo_interno: String(it.emissor_codigo), descricao: String(it.emissor_nome || 'Emissor') } : null,
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

    const componentes = [...componentesSnapshot(item.venda, tecido.id), ...(inst ? [componenteInstalacao(inst)] : [])];

    const ambiente = it.ambiente?.trim() || '';
    const produtoSobMedida = produtoSobMedidaLabel(tipo);
    const nomeProduto = nomeProdutoPersiana({
      ambiente,
      produto_sob_medida: produtoSobMedida,
      largura,
      altura,
    });
    const descricaoProduto = descricaoProdutoPersiana({
      acionamento: it.acionamento,
      cor_acessorio: it.cor_acessorio,
      tecido_nome: tecido.nome,
      rolamento: it.rolamento,
      comando: it.comando,
      tc: item.tc,
      emissor: it.emissor,
      emissor_nome: it.emissor_nome,
      canal: it.canal,
    });
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
      comando: it.comando ?? null,
      bando_codigo: it.bando_codigo ?? null,
      bando_nome: it.bando_nome ?? null,
      emissor: Boolean(it.emissor),
      emissor_codigo: it.emissor ? (it.emissor_codigo ?? null) : null,
      emissor_nome: it.emissor ? (it.emissor_nome ?? null) : null,
      canal: it.canal ?? null,
      fixacao_instalacao: it.fixacao_instalacao === 'teto' || it.fixacao_instalacao === 'parede' ? it.fixacao_instalacao : null,
      qtd_venda: item.venda.tecido.quantidade,
      qtd_producao: item.venda.tecido.quantidade,
      valor_bruto: valorBruto,
      valor_final: valorBruto, // sem desconto: valor cheio vai ao GC
      valor_custo: valorCusto,
      instalacao_id: inst?.id ?? null,
      instalacao_nome: inst?.nome ?? null,
      componentes,
      nome_produto: nomeProduto,
      descricao_produto: descricaoProduto,
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
  itens: { gc_produto_id?: string | null; nome_produto: string; descricao_produto?: string; quantidade?: number; valor_final: number; valor_custo: number }[];
  gc_cliente_id: string;
  gcVendedorId: string | null;
  gcLojaId: string | null;
  /** true p/ revenda: pula o orçamento no GC — fecha a venda direto (Victor 31/07/2026). */
  vendaDireta?: boolean;
}): Promise<{
  gc_orcamento_id: string | null;
  gc_codigo: string | null;
  gc_pedido_id: string | null;
  gc_pedido_codigo: string | null;
  gc_produto_ids: string[];
  gc_produto_ids_criados: string[];
  payload: object;
  resposta: unknown;
}> {
  const usados: string[] = [];
  const criados: string[] = [];
  try {
    const linhas: LinhaProdutoGc[] = [];
    for (const it of args.itens) {
      const quantidade = it.quantidade ?? 1;
      // valor_final/valor_custo representam o total da linha no app. O GC, por
      // outro lado, multiplica quantidade pelo valor unitário — arredondamos aqui
      // (único ponto de arredondamento, RN obrigatória) para que essa multiplicação
      // reconstrua o total exato.
      const valorVendaUnitario = roundHalfUp(it.valor_final / quantidade);
      const valorCustoUnitario = roundHalfUp(it.valor_custo / quantidade);
      if (it.gc_produto_id) {
        usados.push(it.gc_produto_id);
        linhas.push({ gc_produto_id: it.gc_produto_id, quantidade, valor_venda: valorVendaUnitario, valor_custo: valorCustoUnitario });
      } else {
        const produto = await criarProduto({
          nome: it.nome_produto,
          descricao: it.descricao_produto,
          valor_custo: it.valor_custo,
          valor_venda: it.valor_final,
        });
        usados.push(produto.gc_produto_id);
        if (produto.criado) criados.push(produto.gc_produto_id);
        linhas.push({ gc_produto_id: produto.gc_produto_id, quantidade, valor_venda: valorVendaUnitario, valor_custo: valorCustoUnitario });
      }
    }

    // Instalação (Victor 26/06/2026): NÃO é mais linha de serviço — já está embutida no
    // valor de cada produto (componente). Por isso o envio não tem mais `servicos`.
    const dadosGc: NovoOrcamentoGc = {
      cliente_id: args.gc_cliente_id,
      produtos: linhas,
      servicos: [],
      data: new Date().toISOString().slice(0, 10),
      usuario_id: env.GC_USUARIO_INTEGRACAO_ID || null,
      vendedor_id: args.gcVendedorId,
      loja_id: args.gcLojaId,
    };

    // Revenda: sem orçamento no GC — a venda já é fechada direto (Victor 31/07/2026).
    if (args.vendaDireta) {
      const venda = await criarVendaDePayload(montarPayload(dadosGc));
      return {
        gc_orcamento_id: null,
        gc_codigo: null,
        gc_pedido_id: venda.gc_pedido_id,
        gc_pedido_codigo: venda.gc_pedido_codigo,
        gc_produto_ids: usados,
        gc_produto_ids_criados: criados,
        payload: venda.payload,
        resposta: venda.resposta,
      };
    }

    // Não enviamos número: o GestãoClick gera o sequencial e devolve em orc.gc_codigo.
    const orc = await gcCriarOrcamento(dadosGc);
    return {
      gc_orcamento_id: orc.gc_orcamento_id,
      gc_codigo: orc.gc_codigo,
      gc_pedido_id: null,
      gc_pedido_codigo: null,
      gc_produto_ids: usados,
      gc_produto_ids_criados: criados,
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
    comando: p.comando,
    bando_codigo: p.bando_codigo,
    bando_nome: p.bando_nome,
    emissor: p.emissor,
    emissor_codigo: p.emissor_codigo,
    emissor_nome: p.emissor_nome,
    canal: p.canal,
    fixacao_instalacao: p.fixacao_instalacao,
    qtd_venda: p.qtd_venda,
    qtd_producao: p.qtd_producao,
    valor_bruto: p.valor_bruto,
    valor_final: p.valor_final,
    valor_custo: p.valor_custo,
    instalacao_id: p.instalacao_id,
    instalacao_nome: p.instalacao_nome,
    gc_produto_id: gcProdutoIds[i] ?? null,
    nome_produto: p.nome_produto,
    descricao_produto: p.descricao_produto,
    componentes: p.componentes,
  }));
}

export async function criarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const b = req.body ?? {};

  // Tipo POR ITEM (Victor 26/06/2026): `b.tipo` é só fallback p/ rascunhos antigos.
  const tipoFallback = isTipoPersiana(b.tipo) ? (b.tipo as TipoPersiana) : null;
  verificarAcessoCalculadora(sessao, 'persiana');
  const itensEntrada: ItemEntrada[] = (Array.isArray(b.itens) ? b.itens : []).map((it: ItemEntrada) =>
    // Revenda não tem serviço de instalação — ignora qualquer instalacao_id enviado.
    sessao.perfil === 'revenda' ? { ...it, instalacao_id: null } : it,
  );
  if (itensEntrada.length === 0) throw new AppError(400, 'SEM_ITENS', 'Adicione ao menos um item ao orçamento.');
  if (!tipoFallback && !itensEntrada.every((it) => isTipoPersiana(it.tipo ?? ''))) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Selecione o produto sob medida de todos os itens.');
  }

  // Revenda: cliente é sempre o vinculado ao usuário (ignora o corpo da requisição).
  const gcClienteId = sessao.perfil === 'revenda' ? clienteGcDaRevenda(sessao) : b.gc_cliente_id ? String(b.gc_cliente_id) : null;

  // apenas_salvar = rascunho local (não envia ao GestãoClick; cliente opcional).
  const apenasSalvar = b.apenas_salvar === true;
  if (!apenasSalvar && (!gcClienteId || !b.nome_cliente)) {
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
      const tipo = isTipoPersiana(it.tipo ?? '') ? (it.tipo as TipoPersiana) : tipoFallback;
      const t = await buscarTecidoGc(id, tipo);
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
  // Desconto da revenda (embutido, análogo ao RT mas reduzindo o valor): fixo por
  // usuário, salvo no orçamento para o reenvio reproduzir o mesmo % mesmo que o
  // admin altere o desconto da revenda depois.
  const descontoPct = sessao.perfil === 'revenda' ? Math.max(0, Math.min(99, Number(sessao.desconto_percentual) || 0)) : 0;
  if (descontoPct > 0) {
    for (const p of preparados) {
      p.valor_final = valorComDesconto(p.valor_final, descontoPct);
      p.componentes = [...p.componentes, componenteDesconto(descontoPct)];
    }
  }
  const lojaIdOrcamento = sessao.perfil === 'admin'
    ? (b.loja_id ?? editarOrc?.loja_id ?? sessao.loja_id)
    : (editarOrc?.loja_id ?? sessao.loja_id);
  const loja = await resolverLoja(lojaIdOrcamento);
  const primeiro = preparados[0];
  // Instalação, RT e desconto já estão embutidos no valor de cada item — sem linha à parte.
  const valorTotal = roundHalfUp(preparados.reduce((s, p) => s + p.valor_final, 0));

  // Entrada bruta — permite reabrir o rascunho na calculadora (tipo + instalação + RT).
  const entradaJson = { tipo: primeiro.tipo, itens: itensEntrada, rt_pct: rtPct, desconto_pct: descontoPct } as unknown as Prisma.InputJsonValue;

  // Grava: cria novo ou atualiza o rascunho em edição (mesmo registro).
  const persistir = (data: Prisma.OrcamentoUncheckedCreateInput) =>
    editarId
      ? prisma.orcamento.update({ where: { id: editarId }, data: data as Prisma.OrcamentoUncheckedUpdateInput })
      : prisma.orcamento.create({ data });

  const calc = encontrarCalculadora(primeiro.tipo);
  const dbTipoProduto = (calc ? calc.db_tipo_produto : primeiro.tipo) as TipoProduto;

  // Campos comuns ao salvar (sucesso ou erro). Colunas single = 1º item (compat).
  // tipo_produto = tipo do 1º item (representativo; o tipo real de cada item está em itens_json).
  const baseDados = {
    tipo_produto: dbTipoProduto,
    usuario_id: editarOrc?.usuario_id ?? sessao.id,
    loja_id: loja.id,
    entrada_json: entradaJson,
    nome_cliente: b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)',
    gc_cliente_id: gcClienteId,
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
    const vendaDireta = sessao.perfil === 'revenda';
    const envio = await executarEnvioGc({
      itens: preparados.map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
      gc_cliente_id: gcClienteId!,
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
      vendaDireta,
    });

    const snapshots = snapshotsDe(preparados, envio.gc_produto_ids);
    const orcamento = await persistir({
      ...baseDados,
      status: 'enviado',
      gc_produto_id: envio.gc_produto_ids[0] ?? null,
      gc_orcamento_id: envio.gc_orcamento_id,
      gc_codigo: envio.gc_codigo,
      gc_pedido_id: envio.gc_pedido_id,
      gc_pedido_codigo: envio.gc_pedido_codigo,
      ...(envio.gc_pedido_id ? { pedido_confirmado_em: new Date() } : {}),
      itens_json: snapshots as unknown as Prisma.InputJsonValue,
      payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
      resposta_gc: respostaComProdutosCriados(envio.resposta, envio.gc_produto_ids_criados) as Prisma.InputJsonValue,
    });

    // Revenda: a venda já foi fechada — os produtos sintéticos cumpriram o papel,
    // inativa no GC (best-effort) pra não poluir a busca do PDV (mesmo tratamento
    // que gerarVendaOrcamento já dá quando a venda é gerada a partir de um orçamento).
    if (envio.gc_pedido_id) {
      await inativarProdutosSinteticosDoOrcamento(prisma, orcamento, sessao.id, 'venda_gerada');
    }

    await prisma.logAcao.create({
      data: {
        usuario_id: sessao.id,
        acao: vendaDireta ? 'venda_fechada_gc' : 'orcamento_enviado_gc',
        detalhe: { orcamento_id: orcamento.id, gc_orcamento_id: envio.gc_orcamento_id, gc_pedido_id: envio.gc_pedido_id, itens: preparados.length, valor_final: valorBrutoTotal },
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
function preparadosDoSnapshot(snaps: ItemSnapshot[]): { nome_produto: string; descricao_produto?: string; valor_final: number; valor_custo: number }[] {
  return snaps.map((s) => ({ nome_produto: s.nome_produto, descricao_produto: s.descricao_produto, valor_final: Number(s.valor_final), valor_custo: Number(s.valor_custo) }));
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
  descontoPct = 0,
): Promise<ItemPreparado[]> {
  const tecidos = new Map<string, TecidoGc>();
  for (const it of itens) {
    const id = String(it.tecido_id);
    if (!tecidos.has(id)) {
      const tipo = isTipoPersiana(it.tipo ?? '') ? (it.tipo as TipoPersiana) : tipoFallback;
      const t = await buscarTecidoGc(id, tipo);
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
  const descPct = Math.max(0, Math.min(99, Number(descontoPct) || 0));
  if (descPct > 0) {
    for (const p of preparados) {
      p.valor_final = valorComDesconto(p.valor_final, descPct);
      p.componentes = [...p.componentes, componenteDesconto(descPct)];
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

  const entrada = orc.entrada_json as { tipo?: string; itens?: ItemEntrada[]; rt_pct?: number; desconto_pct?: number } | null;
  const itensEntrada = Array.isArray(entrada?.itens) ? entrada.itens : [];
  const recalcular = itensEntrada.length > 0;
  const snaps = (orc.itens_json as unknown as ItemSnapshot[] | null) ?? [];
  if (!recalcular && snaps.length === 0) throw new AppError(400, 'SEM_ITENS', 'Orçamento sem itens para reenviar.');

  const loja = await resolverLoja(orc.loja_id);

  try {
    // Recalcula a partir da entrada (preferido); cai para o snapshot só em registros legados.
    const tipoFallback = isTipoPersiana(entrada?.tipo ?? '') ? (entrada?.tipo as TipoPersiana) : null;
    const preparados = recalcular
      ? await recalcularPersianasDeEntrada(
          tipoFallback,
          itensEntrada,
          Number(entrada?.rt_pct) || 0,
          Number(entrada?.desconto_pct) || 0,
        )
      : null;

    const vendaDireta = sessao.perfil === 'revenda';
    const envio = await executarEnvioGc({
      itens: preparados
        ? preparados.map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_final, valor_custo: p.valor_custo }))
        : preparadosDoSnapshot(snaps),
      gc_cliente_id: orc.gc_cliente_id,
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
      vendaDireta,
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
        gc_pedido_id: envio.gc_pedido_id,
        gc_pedido_codigo: envio.gc_pedido_codigo,
        ...(envio.gc_pedido_id ? { pedido_confirmado_em: new Date() } : {}),
        itens_json: novosSnaps as unknown as Prisma.InputJsonValue,
        payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
        resposta_gc: respostaComProdutosCriados(envio.resposta, envio.gc_produto_ids_criados) as Prisma.InputJsonValue,
        erro_gc: null,
        ...(novoTotal !== null ? { valor_bruto: novoTotal, valor_final: novoTotal } : {}),
      },
    });
    if (envio.gc_pedido_id) {
      await inativarProdutosSinteticosDoOrcamento(prisma, atualizado, sessao.id, 'venda_gerada');
    }
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

export async function gerarVendaOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({ where: { id: String(req.params.id) } });
  if (!orc || (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  }
  if (orc.status !== 'enviado') {
    throw new AppError(409, 'ORCAMENTO_NAO_ENVIADO', 'A venda só pode ser gerada para orçamentos enviados ao GestãoClick.');
  }
  if (!orc.gc_orcamento_id) {
    throw new AppError(409, 'SEM_ORCAMENTO_GC', 'Este orçamento ainda não possui número no GestãoClick.');
  }

  // Único caminho de confirmação de pedido (SRD): antes existia um endpoint
  // paralelo (PUT /:id/pedido) que só gravava o texto digitado, sem checar
  // duplicidade nem tocar a API do GC — foi assim que um pedido chegou a ficar
  // salvo como "123456" (valor de teste nunca corrigido). Agora tanto a tela
  // de Orçamentos quanto o modal de produção chamam esta mesma rota.
  const corpo = (req.body ?? {}) as { gc_pedido_codigo?: unknown; pedido_entrega_em?: unknown };
  const entregaInformada = Object.prototype.hasOwnProperty.call(corpo, 'pedido_entrega_em');
  const entrega = entregaInformada ? validarDataEntrega(corpo.pedido_entrega_em) : undefined;
  const pedidoInformado = typeof corpo.gc_pedido_codigo === 'string' || typeof corpo.gc_pedido_codigo === 'number'
    ? String(corpo.gc_pedido_codigo).trim()
    : '';
  const pedidoAtual = (orc.gc_pedido_codigo ?? '').trim();
  const jaTemPedido = Boolean(orc.gc_pedido_id || orc.gc_pedido_codigo);
  const trocandoPedido = jaTemPedido && Boolean(pedidoInformado) && pedidoInformado !== pedidoAtual;

  // Pedido já confirmado e o número não está mudando: no máximo atualiza a
  // data de entrega — é o caso normal de reabrir o modal só pra ajustar a data.
  if (jaTemPedido && !trocandoPedido) {
    const atualizado = entregaInformada
      ? await prisma.orcamento.update({ where: { id: orc.id }, data: { pedido_entrega_em: entrega } })
      : orc;
    res.json({
      orcamento: atualizado,
      venda: { gc_pedido_id: orc.gc_pedido_id, gc_pedido_codigo: orc.gc_pedido_codigo },
      ja_existia: true,
    });
    return;
  }

  if (pedidoInformado) {
    if (pedidoInformado.length > 50) {
      throw new AppError(400, 'PEDIDO_INVALIDO', 'O número do pedido deve ter no máximo 50 caracteres.');
    }
    const duplicado = await prisma.orcamento.findFirst({
      where: {
        id: { not: orc.id },
        gc_pedido_codigo: pedidoInformado,
      },
      select: { id: true, gc_codigo: true, gc_orcamento_id: true, nome_cliente: true },
    });
    if (duplicado) {
      throw new AppError(
        409,
        'PEDIDO_JA_VINCULADO',
        `O pedido ${pedidoInformado} já está vinculado ao orçamento ${duplicado.gc_codigo ?? duplicado.gc_orcamento_id ?? duplicado.id} (${duplicado.nome_cliente}).`,
      );
    }

    const respostaAnterior = orc.resposta_gc && typeof orc.resposta_gc === 'object' && !Array.isArray(orc.resposta_gc)
      ? orc.resposta_gc as Prisma.JsonObject
      : {};
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: {
        gc_pedido_codigo: pedidoInformado,
        // Zera o id interno da venda do GC: se estava trocando o código de um
        // pedido que tinha vindo da criação automática, o id antigo não
        // corresponde mais ao código digitado agora.
        gc_pedido_id: null,
        pedido_confirmado_em: new Date(),
        ...(entregaInformada ? { pedido_entrega_em: entrega } : {}),
        resposta_gc: {
          ...respostaAnterior,
          venda_vinculada_manual: {
            gc_pedido_codigo: pedidoInformado,
            vinculado_em: new Date().toISOString(),
            usuario_id: sessao.id,
            ...(trocandoPedido ? { pedido_anterior: pedidoAtual } : {}),
          },
        } as Prisma.InputJsonValue,
        erro_gc: null,
      },
    });
    await prisma.logAcao.create({
      data: {
        usuario_id: sessao.id,
        acao: trocandoPedido ? 'pedido_orcamento_corrigido' : 'venda_vinculada_manual',
        detalhe: {
          orcamento_id: orc.id,
          gc_orcamento_id: orc.gc_orcamento_id,
          gc_pedido_codigo: pedidoInformado,
          ...(trocandoPedido ? { pedido_anterior: pedidoAtual } : {}),
        },
      },
    });
    if (!jaTemPedido) {
      // Venda existe: os produtos sintéticos deste orçamento cumpriram o papel —
      // inativa no GC para não poluírem a busca do PDV (best-effort).
      await inativarProdutosSinteticosDoOrcamento(prisma, orc, sessao.id, 'venda_vinculada');
    }
    res.json({
      orcamento: atualizado,
      venda: { gc_pedido_id: null, gc_pedido_codigo: pedidoInformado },
      vinculada_manual: true,
    });
    return;
  }

  if (!orc.payload_gc_enviado) {
    throw new AppError(409, 'SEM_PAYLOAD_GC', 'Não foi encontrado o payload original enviado ao GestãoClick.');
  }

  try {
    const venda = await criarVendaDePayload(orc.payload_gc_enviado);
    const respostaAnterior = orc.resposta_gc && typeof orc.resposta_gc === 'object' && !Array.isArray(orc.resposta_gc)
      ? orc.resposta_gc as Prisma.JsonObject
      : {};
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: {
        gc_pedido_id: venda.gc_pedido_id,
        gc_pedido_codigo: venda.gc_pedido_codigo,
        pedido_confirmado_em: new Date(),
        ...(entregaInformada ? { pedido_entrega_em: entrega } : {}),
        resposta_gc: {
          ...respostaAnterior,
          venda: venda.resposta,
          payload_venda: venda.payload,
        } as Prisma.InputJsonValue,
        erro_gc: null,
      },
    });
    await prisma.logAcao.create({
      data: {
        usuario_id: sessao.id,
        acao: 'venda_gerada_gc',
        detalhe: {
          orcamento_id: orc.id,
          gc_orcamento_id: orc.gc_orcamento_id,
          gc_pedido_id: venda.gc_pedido_id,
          gc_pedido_codigo: venda.gc_pedido_codigo,
        },
      },
    });
    // Venda gerada: os produtos sintéticos deste orçamento cumpriram o papel —
    // inativa no GC para não poluírem a busca do PDV (best-effort).
    await inativarProdutosSinteticosDoOrcamento(prisma, orc, sessao.id, 'venda_gerada');
    res.json({ orcamento: atualizado, venda, ja_existia: false });
  } catch (err) {
    const gc = err instanceof GcError ? err : null;
    await prisma.orcamento.update({
      where: { id: orc.id },
      data: { erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message) },
    });
    res.status(502).json({
      erro: {
        codigo: gc?.status === 401 ? 'GC_AUTH' : 'GC_ERRO',
        message: gc?.message ?? 'Falha ao gerar venda no GestãoClick.',
      },
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
  // "vendas" (só confirmados) e "cliente" (busca por cliente/pedido/orçamento)
  // são dois filtros OR independentes — combinados em AND pra não se pisarem
  // quando os dois estão ativos ao mesmo tempo.
  const condicoes: Prisma.OrcamentoWhereInput[] = [];
  if (req.query.vendas === '1' || req.query.vendas === 'true') {
    condicoes.push({
      OR: [
        { gc_pedido_id: { not: null } },
        { gc_pedido_codigo: { not: null } },
      ],
    });
  }
  if (cliente) {
    condicoes.push({
      OR: [
        { nome_cliente: { contains: cliente, mode: 'insensitive' } },
        { gc_pedido_codigo: { contains: cliente, mode: 'insensitive' } },
        { gc_codigo: { contains: cliente, mode: 'insensitive' } },
        { gc_orcamento_id: { contains: cliente, mode: 'insensitive' } },
      ],
    });
  }
  if (condicoes.length > 0) where.AND = condicoes;

  // Filtro por data de criação. O frontend manda instantes ISO já calculados no
  // fuso do usuário (início/fim do período), então aqui só aplicamos gte/lte.
  const dataInicio = typeof req.query.data_inicio === 'string' ? req.query.data_inicio : '';
  const dataFim = typeof req.query.data_fim === 'string' ? req.query.data_fim : '';
  const criadoEm: Prisma.DateTimeFilter = {};
  const di = dataInicio ? new Date(dataInicio) : null;
  const df = dataFim ? new Date(dataFim) : null;
  if (di && !Number.isNaN(di.getTime())) criadoEm.gte = di;
  if (df && !Number.isNaN(df.getTime())) criadoEm.lte = df;
  if (criadoEm.gte || criadoEm.lte) where.criado_em = criadoEm;

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
    orcamentos: orcamentos.map(normalizarErroOrcamento),
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
  // Orçamento cancelado sem venda: os produtos sintéticos criados no envio não
  // serão mais usados — inativa no GC (best-effort). Com venda já gerada, a
  // inativação aconteceu na geração/vinculação.
  if (orc.status === 'enviado' && !orc.gc_pedido_id && !orc.gc_pedido_codigo) {
    await inativarProdutosSinteticosDoOrcamento(prisma, orc, sessao.id, 'orcamento_cancelado');
  }
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
  // Revenda: cliente é sempre o vinculado ao usuário (ignora o corpo da requisição).
  if (sessao.perfil === 'revenda') data.gc_cliente_id = clienteGcDaRevenda(sessao);
  else if (b.gc_cliente_id !== undefined) data.gc_cliente_id = b.gc_cliente_id ? String(b.gc_cliente_id) : null;
  if (b.nome_cliente !== undefined) data.nome_cliente = b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)';
  const atualizado = await prisma.orcamento.update({ where: { id: orc.id }, data });
  res.json({ orcamento: atualizado });
}

/** POST /api/orcamentos/:id/duplicar — cria uma cópia editável, sem vínculos com o GestãoClick. */
export async function duplicarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({ where: { id: String(req.params.id) } });
  if (!orc || (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  }

  const jsonOuNulo = (valor: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
    valor === null ? Prisma.DbNull : valor as Prisma.InputJsonValue;

  const copia = await prisma.orcamento.create({
    data: {
      tipo_produto: orc.tipo_produto,
      usuario_id: sessao.id,
      loja_id: orc.loja_id,
      status: 'rascunho',
      nome_cliente: orc.nome_cliente,
      gc_cliente_id: orc.gc_cliente_id,
      tecido_codigo_gc: orc.tecido_codigo_gc,
      tecido_nome: orc.tecido_nome,
      largura_m: orc.largura_m,
      altura_m: orc.altura_m,
      dimensao_m: orc.dimensao_m,
      tc_m: orc.tc_m,
      acionamento: orc.acionamento,
      cor_acessorio: orc.cor_acessorio,
      rolamento: orc.rolamento,
      valor_bruto: orc.valor_bruto,
      valor_final: orc.valor_final,
      itens_json: jsonOuNulo(orc.itens_json),
      entrada_json: jsonOuNulo(orc.entrada_json),
      gc_orcamento_id: null,
      gc_codigo: null,
      gc_produto_id: null,
      payload_gc_enviado: Prisma.DbNull,
      resposta_gc: Prisma.DbNull,
      erro_gc: null,
    },
  });

  await prisma.logAcao.create({
    data: { usuario_id: sessao.id, acao: 'orcamento_duplicado', detalhe: { origem_id: orc.id, copia_id: copia.id } },
  });

  res.status(201).json({ orcamento: copia });
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
  res.json({ orcamento: normalizarErroOrcamento(orc) });
}
