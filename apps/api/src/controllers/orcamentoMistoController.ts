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
import { roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { AppError } from '../middleware/errorHandler';
import { resolverLoja } from '../lib/resolverLoja';
import {
  prepararItens, executarEnvioGc, snapshotsDe, recalcularPersianasDeEntrada,
  type ItemEntrada, type ItemSnapshot,
} from './orcamentoController';
import { prepararCortina, recalcularCortinasDeEntrada, type CortinaEntrada, type CortinaPreparada } from './orcamentoCortinaController';
import { valorComRt, componenteRt } from '../services/calc/rtCalc';
import {
  prepararProdutosAvulsos,
  prepararTrilhosEspeciais,
  type ItemExtraPreparado,
  type ProdutoAvulsoEntrada,
  type TrilhoEspecialEntrada,
} from '../services/calc/itensExtras';

interface SessaoUsuario { id: string; perfil: 'vendedor' | 'admin'; gc_usuario_id: string | null; loja_id: string | null }

/** Produto (linha) para o envio combinado ao GestãoClick. */
type LinhaProduto = { gc_produto_id?: string | null; nome_produto: string; descricao_produto?: string; valor_final: number; valor_custo: number };

/** POST /api/orcamentos/misto — cria um orçamento com persianas E cortinas juntas. */
export async function criarOrcamentoMisto(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario! as SessaoUsuario;
  const b = req.body ?? {};
  const apenasSalvar = b.apenas_salvar === true;

  const tipoFallback = isTipoPersiana(b.tipo) ? (b.tipo as TipoPersiana) : null;
  const itensEntrada: ItemEntrada[] = Array.isArray(b.itens) ? b.itens : [];
  const cortinasEntrada: CortinaEntrada[] = Array.isArray(b.cortinas) ? b.cortinas : [];
  const trilhosEntrada: TrilhoEspecialEntrada[] = Array.isArray(b.trilhos_especiais) ? b.trilhos_especiais : [];
  const avulsosEntrada: ProdutoAvulsoEntrada[] = Array.isArray(b.produtos_avulsos) ? b.produtos_avulsos : [];
  const totalSecoes = [itensEntrada.length, cortinasEntrada.length, trilhosEntrada.length, avulsosEntrada.length].filter((n) => n > 0).length;
  if (totalSecoes === 0) {
    throw new AppError(400, 'MISTO_INVALIDO', 'Adicione ao menos um item ao orçamento.');
  }
  if (itensEntrada.length > 0 && !tipoFallback && !itensEntrada.every((it) => isTipoPersiana(it.tipo ?? ''))) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Selecione o produto sob medida de todas as persianas.');
  }
  if (!apenasSalvar && (!b.gc_cliente_id || !b.nome_cliente)) {
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
      p.valor_final = valorComRt(p.valor_final, rtPct);
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
    ...extrasPrep.map((p) => ({ gc_produto_id: p.produto_id, nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
  ];

  const entradaJson = { tipo: persPrep[0]?.tipo ?? null, itens: itensEntrada, cortinas: cortinasEntrada, trilhos_especiais: trilhosEntrada, produtos_avulsos: avulsosEntrada, rt_pct: rtPct } as unknown as Prisma.InputJsonValue;
  const primeiro = persPrep[0] ?? null;
  const primeiraCortina = cortPrep[0]?.snapshot as { largura_m?: number; altura_m?: number; nome_produto?: string } | undefined;
  const primeiroExtra = extrasPrep[0] ?? null;
  const baseDados = {
    tipo_produto: 'misto' as const,
    usuario_id: editarOrc?.usuario_id ?? sessao.id,
    loja_id: loja.id,
    entrada_json: entradaJson,
    nome_cliente: b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)',
    gc_cliente_id: b.gc_cliente_id ? String(b.gc_cliente_id) : null,
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
    const envio = await executarEnvioGc({
      itens: produtosEnvio,
      gc_cliente_id: String(b.gc_cliente_id),
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });
    const persProdIds = envio.gc_produto_ids.slice(0, persPrep.length);
    const orcamento = await persistir({
      ...baseDados,
      status: 'enviado',
      gc_produto_id: envio.gc_produto_ids[0] ?? null,
      gc_orcamento_id: envio.gc_orcamento_id,
      gc_codigo: envio.gc_codigo,
      itens_json: itensJson(persProdIds),
      payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
      resposta_gc: envio.resposta as Prisma.InputJsonValue,
    });
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_enviado_gc', detalhe: { orcamento_id: orcamento.id, tipo: 'misto', gc_orcamento_id: envio.gc_orcamento_id, persianas: persPrep.length, cortinas: cortPrep.length, trilhos_especiais: trilhosPrep.length, produtos_avulsos: avulsosPrep.length, valor_final: valorTotal } } });
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
interface ExtraSnap { produto_id?: string; nome_produto?: string; descricao_produto?: string; valor_final?: number; valor_custo?: number }
interface MistoItensJson { persiana?: { tipo: string; itens: ItemSnapshot[] }; cortinas?: CortinaSnap[]; trilhos_especiais?: ExtraSnap[]; produtos_avulsos?: ExtraSnap[]; instalacao?: number }

/** Reenvia um orçamento MISTO ao GestãoClick (replay do snapshot salvo). */
export async function reenviarMisto(orc: Orcamento, sessao: { id: string; gc_usuario_id: string | null }, res: Response): Promise<void> {
  const entrada = orc.entrada_json as { tipo?: string; itens?: ItemEntrada[]; cortinas?: CortinaEntrada[]; trilhos_especiais?: TrilhoEspecialEntrada[]; produtos_avulsos?: ProdutoAvulsoEntrada[]; rt_pct?: number } | null;
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
  const tipoFallback = isTipoPersiana(entrada?.tipo ?? '') ? (entrada?.tipo as TipoPersiana) : null;
  const persPrep = itensEntrada.length > 0
    ? await recalcularPersianasDeEntrada(tipoFallback, itensEntrada, rtPct)
    : null;
  const cortPrep = cortinasEntrada.length > 0
    ? await recalcularCortinasDeEntrada(cortinasEntrada, rtPct)
    : null;
  const trilhosPrep = trilhosEntrada.length > 0 ? await prepararTrilhosEspeciais(trilhosEntrada) : [];
  const avulsosPrep = avulsosEntrada.length > 0 ? await prepararProdutosAvulsos(avulsosEntrada) : [];
  const extrasPrep = [...trilhosPrep, ...avulsosPrep];

  const produtos: LinhaProduto[] = recalcular
    ? [
        ...(persPrep ?? []).map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
        ...(cortPrep ?? []).map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_total, valor_custo: p.valor_custo })),
        ...extrasPrep.map((p) => ({ gc_produto_id: p.produto_id, nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
      ]
    : [
        ...persSnaps.map((s) => ({ nome_produto: s.nome_produto, descricao_produto: s.descricao_produto, valor_final: Number(s.valor_final), valor_custo: Number(s.valor_custo) })),
        ...cortSnaps.map((s) => ({ nome_produto: String(s.nome_produto ?? 'Cortina'), descricao_produto: s.descricao_produto ? String(s.descricao_produto) : undefined, valor_final: Number(s.valor_total) || 0, valor_custo: Number(s.valor_custo) || 0 })),
        ...[...trilhoSnaps, ...avulsoSnaps].map((s) => ({ gc_produto_id: s.produto_id ?? null, nome_produto: String(s.nome_produto ?? 'Produto'), descricao_produto: s.descricao_produto ? String(s.descricao_produto) : undefined, valor_final: Number(s.valor_final) || 0, valor_custo: Number(s.valor_custo) || 0 })),
      ];

  try {
    const envio = await executarEnvioGc({
      itens: produtos,
      gc_cliente_id: orc.gc_cliente_id!,
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
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
        payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
        resposta_gc: envio.resposta as Prisma.InputJsonValue,
        erro_gc: null,
        ...(novoItensJson ? { itens_json: novoItensJson } : {}),
        ...(novoTotal !== null ? { valor_bruto: novoTotal, valor_final: novoTotal } : {}),
      },
    });
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
