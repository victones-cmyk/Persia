// apps/api/src/controllers/orcamentoMistoController.ts
// Orçamento MISTO (persiana + cortina no MESMO orçamento) — tela única (Victor v.3.1).
// Recalcula persianas e cortinas no servidor, cria todos os produtos sintéticos e
// envia UM ÚNICO orçamento ao GestãoClick (produtos das duas naturezas + 1 serviço
// de instalação por peça = nº total de peças). Reusa a lógica dos controllers puros.

import type { Request, Response } from 'express';
import { Prisma, type Orcamento } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isTipoPersiana, type TipoPersiana } from '../services/calc/tipos';
import { buscarTecidoGc, type TecidoGc } from '../services/gc/tecidos';
import { ajustarTotalParaQuantidade, roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { inativarProdutosSinteticosDoOrcamento, respostaComProdutosCriados } from '../services/gc/limpezaProdutos';
import { AppError } from '../middleware/errorHandler';
import { resolverLoja } from '../lib/resolverLoja';
import {
  prepararItens, executarEnvioGc, snapshotsDe, recalcularPersianasDeEntrada,
  type ItemEntrada, type ItemSnapshot,
} from './orcamentoController';
import { prepararCortina, recalcularCortinasDeEntrada, type CortinaEntrada, type CortinaPreparada } from './orcamentoCortinaController';
import { valorComRt, componenteRt } from '../services/calc/rtCalc';
import { valorComDesconto, componenteDesconto } from '../services/calc/descontoCalc';
import { verificarAcessoCalculadora, clienteGcDaRevenda, resolverDescontoPct } from '../lib/permissaoRevenda';
import { resolverVendedorAtribuido } from '../lib/atribuicaoVendedor';
import {
  prepararProdutosAvulsos,
  prepararTrilhosEspeciais,
  type ItemExtraPreparado,
  type ProdutoAvulsoEntrada,
  type TrilhoEspecialEntrada,
} from '../services/calc/itensExtras';

interface SessaoUsuario {
  id: string;
  perfil: 'vendedor' | 'admin' | 'revenda';
  gc_usuario_id: string | null;
  loja_id: string | null;
  gc_cliente_vinculado_id?: string | null;
  desconto_percentual?: number | null;
  calculadoras_permitidas?: string[];
}

/** Produto (linha) para o envio combinado ao GestãoClick. */
type LinhaProduto = { gc_produto_id?: string | null; nome_produto: string; descricao_produto?: string; quantidade?: number; valor_final: number; valor_custo: number };

/** POST /api/orcamentos/misto — cria um orçamento com persianas E cortinas juntas. */
export async function criarOrcamentoMisto(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario! as SessaoUsuario;
  const b = req.body ?? {};
  const apenasSalvar = b.apenas_salvar === true;
  // Admin pode montar o orçamento em nome de um vendedor (aparece na listagem dele).
  const vendedorAtribuido = await resolverVendedorAtribuido(sessao, b.vendedor_id);

  const tipoFallback = isTipoPersiana(b.tipo) ? (b.tipo as TipoPersiana) : null;
  const semInstalacao = sessao.perfil === 'revenda'; // revenda não tem serviço de instalação
  const itensEntrada: ItemEntrada[] = (Array.isArray(b.itens) ? b.itens : []).map((it: ItemEntrada) =>
    semInstalacao ? { ...it, instalacao_id: null } : it,
  );
  const cortinasEntrada: CortinaEntrada[] = (Array.isArray(b.cortinas) ? b.cortinas : []).map((c: CortinaEntrada) =>
    semInstalacao ? { ...c, instalacao_id: null } : c,
  );
  const trilhosEntrada: TrilhoEspecialEntrada[] = Array.isArray(b.trilhos_especiais) ? b.trilhos_especiais : [];
  const avulsosEntrada: ProdutoAvulsoEntrada[] = Array.isArray(b.produtos_avulsos) ? b.produtos_avulsos : [];
  if (itensEntrada.length > 0) verificarAcessoCalculadora(sessao, 'persiana');
  if (cortinasEntrada.length > 0) verificarAcessoCalculadora(sessao, 'cortina');
  if (trilhosEntrada.length > 0) verificarAcessoCalculadora(sessao, 'trilho');
  if (avulsosEntrada.length > 0) verificarAcessoCalculadora(sessao, 'avulso');
  const totalSecoes = [itensEntrada.length, cortinasEntrada.length, trilhosEntrada.length, avulsosEntrada.length].filter((n) => n > 0).length;
  if (totalSecoes === 0) {
    throw new AppError(400, 'MISTO_INVALIDO', 'Adicione ao menos um item ao orçamento.');
  }
  if (itensEntrada.length > 0 && !tipoFallback && !itensEntrada.every((it) => isTipoPersiana(it.tipo ?? ''))) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Selecione o produto sob medida de todas as persianas.');
  }

  // Revenda: cliente é sempre o vinculado ao usuário (ignora o corpo da requisição).
  const gcClienteId = sessao.perfil === 'revenda' ? clienteGcDaRevenda(sessao) : b.gc_cliente_id ? String(b.gc_cliente_id) : null;
  if (!apenasSalvar && (!gcClienteId || !b.nome_cliente)) {
    throw new AppError(400, 'CLIENTE_OBRIGATORIO', 'Selecione um cliente.');
  }

  // editar_id = reabrir rascunho misto e regravar no MESMO registro.
  const editarId = typeof b.editar_id === 'string' && b.editar_id ? b.editar_id : null;
  let editarOrc = null as Orcamento | null;
  if (editarId) {
    editarOrc = await prisma.orcamento.findUnique({ where: { id: editarId } });
    // Resposta uniforme p/ inexistente e sem-permissão: não revela orçamento alheio.
    if (!editarOrc || (sessao.perfil !== 'admin' && editarOrc.usuario_id !== sessao.id)) {
      throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
    }
    if (editarOrc.status !== 'rascunho') throw new AppError(400, 'NAO_EDITAVEL', 'Só é possível editar orçamentos em rascunho.');
  }

  // --- Persiana: busca tecidos + recalcula ---
  const tecidos = new Map<string, TecidoGc>();
  for (const it of itensEntrada) {
    const id = String(it.tecido_id);
    if (!tecidos.has(id)) {
      const tipoItem = isTipoPersiana(it.tipo ?? '') ? (it.tipo as TipoPersiana) : tipoFallback;
      const t = await buscarTecidoGc(id, tipoItem);
      if (!t) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido em todas as persianas.');
      tecidos.set(id, t);
    }
  }
  const { preparados: persPrep } = itensEntrada.length > 0
    ? await prepararItens(tipoFallback, itensEntrada, tecidos)
    : { preparados: [] };

  // --- Cortinas: recalcula cada uma ---
  const cortPrep: CortinaPreparada[] = [];
  for (const c of cortinasEntrada) cortPrep.push(await prepararCortina(c));
  const trilhosPrep = await prepararTrilhosEspeciais(trilhosEntrada);
  const avulsosPrep = await prepararProdutosAvulsos(avulsosEntrada);
  const extrasPrep: ItemExtraPreparado[] = [...trilhosPrep, ...avulsosPrep];

  // RT do arquiteto (Victor 27/06/2026): gross-up embutido no valor de venda de cada
  // produto (persiana e cortina); custo inalterado; % vale para o orçamento todo.
  const rtPct = Math.max(0, Math.min(99, Number(b.rt_pct) || 0));
  if (rtPct > 0) {
    for (const p of persPrep) {
      p.valor_final = valorComRt(p.valor_final, rtPct);
      p.componentes = [...p.componentes, componenteRt(rtPct)];
    }
    for (const p of cortPrep) {
      p.valor_total = valorComRt(p.valor_total, rtPct);
      (p.snapshot as { valor_total?: number }).valor_total = p.valor_total;
    }
    for (const p of extrasPrep) {
      const comRt = valorComRt(p.valor_final, rtPct);
      // Produtos avulsos enviam quantidade real ao GC (RN-10): o gross-up de RT
      // precisa preservar o total como múltiplo exato de um preço unitário.
      p.valor_final = p.tipo === 'produto_avulso' ? ajustarTotalParaQuantidade(comRt, p.quantidade) : comRt;
    }
  }
  // Desconto da revenda (embutido, análogo ao RT mas reduzindo o valor). Fixo por
  // usuário; vale para tudo que ela orçar (persiana, cortina, trilhos e avulsos).
  // Vendedor/admin: detectado automaticamente pelo cliente escolhido, a menos que
  // desligado pra este orçamento (b.desconto_revenda_desativado).
  const descontoRevendaDesativado = b.desconto_revenda_desativado === true;
  const { pct: descontoPct } = await resolverDescontoPct(sessao, gcClienteId, descontoRevendaDesativado);
  if (descontoPct > 0) {
    for (const p of persPrep) {
      p.valor_final = valorComDesconto(p.valor_final, descontoPct);
      p.componentes = [...p.componentes, componenteDesconto(descontoPct)];
    }
    for (const p of cortPrep) {
      p.valor_total = valorComDesconto(p.valor_total, descontoPct);
      (p.snapshot as { valor_total?: number }).valor_total = p.valor_total;
    }
    for (const p of extrasPrep) {
      const comDesconto = valorComDesconto(p.valor_final, descontoPct);
      p.valor_final = p.tipo === 'produto_avulso' ? ajustarTotalParaQuantidade(comDesconto, p.quantidade) : comDesconto;
    }
  }
  const valorCortinas = roundHalfUp(cortPrep.reduce((s, p) => s + p.valor_total, 0));
  const persTotal = roundHalfUp(persPrep.reduce((s, p) => s + p.valor_final, 0));
  const extrasTotal = roundHalfUp(extrasPrep.reduce((s, p) => s + p.valor_final, 0));

  // Instalação e RT já embutidos no valor de cada produto.
  const valorTotal = roundHalfUp(persTotal + valorCortinas + extrasTotal);

  const lojaIdOrcamento = sessao.perfil === 'admin'
    ? (b.loja_id ?? editarOrc?.loja_id ?? sessao.loja_id)
    : (editarOrc?.loja_id ?? sessao.loja_id);
  const loja = await resolverLoja(lojaIdOrcamento);

  // Produtos para o GC: PERSIANAS primeiro, depois CORTINAS (ordem usada p/ mapear ids).
  const produtosEnvio: LinhaProduto[] = [
    ...persPrep.map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
    ...cortPrep.map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_total, valor_custo: p.valor_custo })),
    ...extrasPrep.map((p) => ({ gc_produto_id: p.tipo === 'produto_avulso' ? p.produto_id : null, nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, quantidade: p.tipo === 'produto_avulso' ? p.quantidade : undefined, valor_final: p.valor_final, valor_custo: p.valor_custo })),
  ];

  const entradaJson = { tipo: persPrep[0]?.tipo ?? null, itens: itensEntrada, cortinas: cortinasEntrada, trilhos_especiais: trilhosEntrada, produtos_avulsos: avulsosEntrada, rt_pct: rtPct, desconto_pct: descontoPct, desconto_revenda_desativado: descontoRevendaDesativado } as unknown as Prisma.InputJsonValue;
  const primeiro = persPrep[0] ?? null;
  const primeiraCortina = cortPrep[0]?.snapshot as { largura_m?: number; altura_m?: number; nome_produto?: string } | undefined;
  const primeiroExtra = extrasPrep[0] ?? null;
  const baseDados = {
    tipo_produto: 'misto' as const,
    usuario_id: vendedorAtribuido?.id ?? editarOrc?.usuario_id ?? sessao.id,
    loja_id: loja.id,
    entrada_json: entradaJson,
    nome_cliente: b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)',
    gc_cliente_id: gcClienteId,
    tecido_codigo_gc: primeiro?.tecido.id ?? primeiroExtra?.produto_id ?? '',
    tecido_nome: [
      persPrep.length ? `${persPrep.length} persiana(s)` : null,
      cortPrep.length ? `${cortPrep.length} cortina(s)` : null,
      trilhosPrep.length ? `${trilhosPrep.length} trilho(s) especial(is)` : null,
      avulsosPrep.length ? `${avulsosPrep.length} produto(s) avulso(s)` : null,
    ].filter(Boolean).join(' + '),
    largura_m: primeiro?.largura ?? primeiraCortina?.largura_m ?? primeiroExtra?.largura ?? 0,
    altura_m: primeiro?.altura ?? primeiraCortina?.altura_m ?? 0,
    dimensao_m: primeiro?.tecido.dimensao_m ?? 0,
    tc_m: primeiro?.tc ?? 0,
    acionamento: primeiro?.acionamento ?? null,
    cor_acessorio: primeiro?.cor_acessorio ?? null,
    rolamento: primeiro?.rolamento ?? null,
    valor_bruto: valorTotal,
    valor_final: valorTotal,
  };

  // itens_json: persianas (com snapshot) + cortinas (snapshot). Instalação embutida nos valores.
  const itensJson = (persProdIds: string[]) =>
    ({
      persiana: persPrep.length > 0 ? { tipo: persPrep[0].tipo, itens: snapshotsDe(persPrep, persProdIds) } : { tipo: null, itens: [] },
      cortinas: cortPrep.map((p) => p.snapshot),
      trilhos_especiais: trilhosPrep,
      produtos_avulsos: avulsosPrep,
    }) as unknown as Prisma.InputJsonValue;

  const persistir = (data: Prisma.OrcamentoUncheckedCreateInput) =>
    editarId
      ? prisma.orcamento.update({ where: { id: editarId }, data: data as Prisma.OrcamentoUncheckedUpdateInput })
      : prisma.orcamento.create({ data });

  // Apenas salvar: rascunho local, sem tocar no GestãoClick.
  if (apenasSalvar) {
    const orcamento = await persistir({ ...baseDados, status: 'rascunho', itens_json: itensJson([]) });
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_salvo_rascunho', detalhe: { orcamento_id: orcamento.id, tipo: 'misto', persianas: persPrep.length, cortinas: cortPrep.length, trilhos_especiais: trilhosPrep.length, produtos_avulsos: avulsosPrep.length, valor_final: valorTotal } } });
    res.status(201).json({ orcamento });
    return;
  }

  try {
    const vendaDireta = sessao.perfil === 'revenda';
    const envio = await executarEnvioGc({
      itens: produtosEnvio,
      gc_cliente_id: gcClienteId!,
      gcVendedorId: vendedorAtribuido?.gc_usuario_id ?? sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
      vendaDireta,
    });
    const persProdIds = envio.gc_produto_ids.slice(0, persPrep.length);
    const orcamento = await persistir({
      ...baseDados,
      status: 'enviado',
      gc_produto_id: envio.gc_produto_ids[0] ?? null,
      gc_orcamento_id: envio.gc_orcamento_id,
      gc_codigo: envio.gc_codigo,
      gc_pedido_id: envio.gc_pedido_id,
      gc_pedido_codigo: envio.gc_pedido_codigo,
      ...(envio.gc_pedido_id ? { pedido_confirmado_em: new Date() } : {}),
      itens_json: itensJson(persProdIds),
      payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
      resposta_gc: respostaComProdutosCriados(envio.resposta, envio.gc_produto_ids_criados) as Prisma.InputJsonValue,
    });
    if (envio.gc_pedido_id) {
      await inativarProdutosSinteticosDoOrcamento(prisma, orcamento, sessao.id, 'venda_gerada');
    }
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: vendaDireta ? 'venda_fechada_gc' : 'orcamento_enviado_gc', detalhe: { orcamento_id: orcamento.id, tipo: 'misto', gc_orcamento_id: envio.gc_orcamento_id, gc_pedido_id: envio.gc_pedido_id, persianas: persPrep.length, cortinas: cortPrep.length, trilhos_especiais: trilhosPrep.length, produtos_avulsos: avulsosPrep.length, valor_final: valorTotal } } });
    res.status(201).json({ orcamento });
  } catch (err) {
    const gc = err instanceof GcError ? err : null;
    const orcamento = await persistir({
      ...baseDados,
      status: 'erro',
      itens_json: itensJson([]),
      erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message),
      payload_gc_enviado: (gc?.payload as object as Prisma.InputJsonValue) ?? undefined,
    });
    res.status(502).json({
      orcamento,
      erro: { codigo: gc?.status === 401 ? 'GC_AUTH' : 'GC_ERRO', status: gc?.status ?? 0, message: gc?.message ?? 'Falha ao enviar ao GestãoClick.' },
    });
  }
}

interface CortinaSnap { nome_produto?: string; descricao_produto?: string; valor_total?: number; valor_custo?: number }
interface ExtraSnap { produto_id?: string; nome_produto?: string; descricao_produto?: string; quantidade?: number; valor_final?: number; valor_custo?: number }
interface MistoItensJson { persiana?: { tipo: string; itens: ItemSnapshot[] }; cortinas?: CortinaSnap[]; trilhos_especiais?: ExtraSnap[]; produtos_avulsos?: ExtraSnap[]; instalacao?: number }

/** Reenvia um orçamento MISTO ao GestãoClick (replay do snapshot salvo). */
export async function reenviarMisto(orc: Orcamento, sessao: { id: string; perfil: string; gc_usuario_id: string | null }, res: Response): Promise<void> {
  const entrada = orc.entrada_json as { tipo?: string; itens?: ItemEntrada[]; cortinas?: CortinaEntrada[]; trilhos_especiais?: TrilhoEspecialEntrada[]; produtos_avulsos?: ProdutoAvulsoEntrada[]; rt_pct?: number; desconto_pct?: number } | null;
  const itensEntrada = Array.isArray(entrada?.itens) ? entrada.itens : [];
  const cortinasEntrada = Array.isArray(entrada?.cortinas) ? entrada.cortinas : [];
  const trilhosEntrada = Array.isArray(entrada?.trilhos_especiais) ? entrada.trilhos_especiais : [];
  const avulsosEntrada = Array.isArray(entrada?.produtos_avulsos) ? entrada.produtos_avulsos : [];
  const recalcular = itensEntrada.length > 0 || cortinasEntrada.length > 0 || trilhosEntrada.length > 0 || avulsosEntrada.length > 0;

  // Snapshot (fallback legado, quando não há entrada_json).
  const itens = orc.itens_json as unknown as MistoItensJson | null;
  const persSnaps = itens?.persiana?.itens ?? [];
  const cortSnaps = itens?.cortinas ?? [];
  const trilhoSnaps = itens?.trilhos_especiais ?? [];
  const avulsoSnaps = itens?.produtos_avulsos ?? [];
  if (!recalcular && persSnaps.length === 0 && cortSnaps.length === 0 && trilhoSnaps.length === 0 && avulsoSnaps.length === 0) throw new AppError(400, 'SEM_ITENS', 'Orçamento misto sem itens para reenviar.');
  const loja = await resolverLoja(orc.loja_id);

  // Recalcula a partir da entrada (preferido); garante valor derivado do servidor (RN-10).
  const rtPct = Number(entrada?.rt_pct) || 0;
  const descontoPct = Number(entrada?.desconto_pct) || 0;
  const tipoFallback = isTipoPersiana(entrada?.tipo ?? '') ? (entrada?.tipo as TipoPersiana) : null;
  const persPrep = itensEntrada.length > 0
    ? await recalcularPersianasDeEntrada(tipoFallback, itensEntrada, rtPct, descontoPct)
    : null;
  const cortPrep = cortinasEntrada.length > 0
    ? await recalcularCortinasDeEntrada(cortinasEntrada, rtPct, descontoPct)
    : null;
  const trilhosPrep = trilhosEntrada.length > 0 ? await prepararTrilhosEspeciais(trilhosEntrada) : [];
  const avulsosPrep = avulsosEntrada.length > 0 ? await prepararProdutosAvulsos(avulsosEntrada) : [];
  const extrasPrep = [...trilhosPrep, ...avulsosPrep];
  if (rtPct > 0) {
    for (const p of extrasPrep) {
      const comRt = valorComRt(p.valor_final, rtPct);
      p.valor_final = p.tipo === 'produto_avulso' ? ajustarTotalParaQuantidade(comRt, p.quantidade) : comRt;
    }
  }
  if (descontoPct > 0) {
    for (const p of extrasPrep) {
      const comDesconto = valorComDesconto(p.valor_final, descontoPct);
      p.valor_final = p.tipo === 'produto_avulso' ? ajustarTotalParaQuantidade(comDesconto, p.quantidade) : comDesconto;
    }
  }

  const produtos: LinhaProduto[] = recalcular
    ? [
        ...(persPrep ?? []).map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
        ...(cortPrep ?? []).map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_total, valor_custo: p.valor_custo })),
        ...extrasPrep.map((p) => ({ gc_produto_id: p.tipo === 'produto_avulso' ? p.produto_id : null, nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, quantidade: p.tipo === 'produto_avulso' ? p.quantidade : undefined, valor_final: p.valor_final, valor_custo: p.valor_custo })),
      ]
    : [
        ...persSnaps.map((s) => ({ nome_produto: s.nome_produto, descricao_produto: s.descricao_produto, valor_final: Number(s.valor_final), valor_custo: Number(s.valor_custo) })),
        ...cortSnaps.map((s) => ({ nome_produto: String(s.nome_produto ?? 'Cortina'), descricao_produto: s.descricao_produto ? String(s.descricao_produto) : undefined, valor_final: Number(s.valor_total) || 0, valor_custo: Number(s.valor_custo) || 0 })),
        ...trilhoSnaps.map((s) => ({ gc_produto_id: s.produto_id ?? null, nome_produto: String(s.nome_produto ?? 'Produto'), descricao_produto: s.descricao_produto ? String(s.descricao_produto) : undefined, valor_final: Number(s.valor_final) || 0, valor_custo: Number(s.valor_custo) || 0 })),
        ...avulsoSnaps.map((s) => ({ gc_produto_id: s.produto_id ?? null, nome_produto: String(s.nome_produto ?? 'Produto'), descricao_produto: s.descricao_produto ? String(s.descricao_produto) : undefined, quantidade: Number(s.quantidade) || 1, valor_final: Number(s.valor_final) || 0, valor_custo: Number(s.valor_custo) || 0 })),
      ];

  try {
    const envio = await executarEnvioGc({
      itens: produtos,
      gc_cliente_id: orc.gc_cliente_id!,
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
      vendaDireta: sessao.perfil === 'revenda',
    });
    // Quando recalculado, regrava o snapshot e o total a partir do que foi enviado.
    const persProdIds = envio.gc_produto_ids.slice(0, (persPrep ?? []).length);
    const novoItensJson = recalcular
      ? ({ persiana: { tipo: persPrep?.[0]?.tipo ?? entrada?.tipo, itens: snapshotsDe(persPrep ?? [], persProdIds) }, cortinas: (cortPrep ?? []).map((p) => p.snapshot), trilhos_especiais: trilhosPrep, produtos_avulsos: avulsosPrep } as unknown as Prisma.InputJsonValue)
      : undefined;
    const novoTotal = recalcular
      ? roundHalfUp([...(persPrep ?? []).map((p) => p.valor_final), ...(cortPrep ?? []).map((p) => p.valor_total), ...extrasPrep.map((p) => p.valor_final)].reduce((s, v) => s + v, 0))
      : null;
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
        payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
        resposta_gc: respostaComProdutosCriados(envio.resposta, envio.gc_produto_ids_criados) as Prisma.InputJsonValue,
        erro_gc: null,
        ...(novoItensJson ? { itens_json: novoItensJson } : {}),
        ...(novoTotal !== null ? { valor_bruto: novoTotal, valor_final: novoTotal } : {}),
      },
    });
    if (envio.gc_pedido_id) {
      await inativarProdutosSinteticosDoOrcamento(prisma, atualizado, sessao.id, 'venda_gerada');
    }
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_reenviado', detalhe: { orcamento_id: orc.id, tipo: 'misto' } } });
    res.json({ orcamento: atualizado });
  } catch (err) {
    const gc = err instanceof GcError ? err : null;
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: { status: 'erro', erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message) },
    });
    res.status(502).json({ orcamento: atualizado, erro: { codigo: gc?.status === 401 ? 'GC_AUTH' : 'GC_ERRO', message: gc?.message ?? 'Falha no reenvio.' } });
  }
}
