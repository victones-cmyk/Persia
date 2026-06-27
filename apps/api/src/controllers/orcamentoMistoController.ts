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
  prepararItens, executarEnvioGc, snapshotsDe,
  type ItemEntrada, type ItemSnapshot,
} from './orcamentoController';
import { prepararCortina, type CortinaEntrada, type CortinaPreparada } from './orcamentoCortinaController';
import { valorComRt, componenteRt } from '../services/calc/rtCalc';

interface SessaoUsuario { id: string; perfil: 'vendedor' | 'admin'; gc_usuario_id: string | null; loja_id: string | null }

/** Produto (linha) para o envio combinado ao GestãoClick. */
type LinhaProduto = { nome_produto: string; valor_final: number; valor_custo: number };

/** POST /api/orcamentos/misto — cria um orçamento com persianas E cortinas juntas. */
export async function criarOrcamentoMisto(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario! as SessaoUsuario;
  const b = req.body ?? {};
  const apenasSalvar = b.apenas_salvar === true;

  if (!isTipoPersiana(b.tipo)) throw new AppError(400, 'TIPO_INVALIDO', 'Tipo de persiana inválido.');
  const tipo = b.tipo as TipoPersiana;
  const itensEntrada: ItemEntrada[] = Array.isArray(b.itens) ? b.itens : [];
  const cortinasEntrada: CortinaEntrada[] = Array.isArray(b.cortinas) ? b.cortinas : [];
  // Misto = exige ao menos 1 de cada (casos puros usam /orcamentos ou /orcamentos/cortina).
  if (itensEntrada.length === 0 || cortinasEntrada.length === 0) {
    throw new AppError(400, 'MISTO_INVALIDO', 'Orçamento misto exige ao menos 1 persiana e 1 cortina.');
  }
  if (!apenasSalvar && (!b.gc_cliente_id || !b.nome_cliente)) {
    throw new AppError(400, 'CLIENTE_OBRIGATORIO', 'Selecione um cliente.');
  }

  // editar_id = reabrir rascunho misto e regravar no MESMO registro.
  const editarId = typeof b.editar_id === 'string' && b.editar_id ? b.editar_id : null;
  let editarOrc = null as Orcamento | null;
  if (editarId) {
    editarOrc = await prisma.orcamento.findUnique({ where: { id: editarId } });
    if (!editarOrc) throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
    if (sessao.perfil !== 'admin' && editarOrc.usuario_id !== sessao.id) throw new AppError(403, 'ACESSO_NEGADO', 'Sem permissão para editar este orçamento.');
    if (editarOrc.status !== 'rascunho') throw new AppError(400, 'NAO_EDITAVEL', 'Só é possível editar orçamentos em rascunho.');
  }

  // --- Persiana: busca tecidos + recalcula ---
  const tecidos = new Map<string, TecidoGc>();
  for (const it of itensEntrada) {
    const id = String(it.tecido_id);
    if (!tecidos.has(id)) {
      const t = await buscarTecidoGc(id);
      if (!t) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido em todas as persianas.');
      tecidos.set(id, t);
    }
  }
  const { preparados: persPrep } = await prepararItens(tipo, itensEntrada, tecidos);

  // --- Cortinas: recalcula cada uma ---
  const cortPrep: CortinaPreparada[] = [];
  for (const c of cortinasEntrada) cortPrep.push(await prepararCortina(c));

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
  }
  const valorCortinas = roundHalfUp(cortPrep.reduce((s, p) => s + p.valor_total, 0));
  const persTotal = roundHalfUp(persPrep.reduce((s, p) => s + p.valor_final, 0));

  // Instalação e RT já embutidos no valor de cada produto.
  const valorTotal = roundHalfUp(persTotal + valorCortinas);

  const loja = await resolverLoja(editarOrc?.loja_id ?? sessao.loja_id);

  // Produtos para o GC: PERSIANAS primeiro, depois CORTINAS (ordem usada p/ mapear ids).
  const produtosEnvio: LinhaProduto[] = [
    ...persPrep.map((p) => ({ nome_produto: p.nome_produto, valor_final: p.valor_final, valor_custo: p.valor_custo })),
    ...cortPrep.map((p) => ({ nome_produto: p.nome_produto, valor_final: p.valor_total, valor_custo: p.valor_custo })),
  ];

  const entradaJson = { tipo: persPrep[0].tipo, itens: itensEntrada, cortinas: cortinasEntrada, rt_pct: rtPct } as unknown as Prisma.InputJsonValue;
  const primeiro = persPrep[0];
  const baseDados = {
    tipo_produto: 'misto' as const,
    usuario_id: editarOrc?.usuario_id ?? sessao.id,
    loja_id: editarOrc?.loja_id ?? loja.id,
    entrada_json: entradaJson,
    nome_cliente: b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)',
    gc_cliente_id: b.gc_cliente_id ? String(b.gc_cliente_id) : null,
    tecido_codigo_gc: primeiro.tecido.id,
    tecido_nome: `${persPrep.length} persiana(s) + ${cortPrep.length} cortina(s)`,
    largura_m: primeiro.largura,
    altura_m: primeiro.altura,
    dimensao_m: primeiro.tecido.dimensao_m,
    tc_m: primeiro.tc,
    acionamento: primeiro.acionamento,
    cor_acessorio: primeiro.cor_acessorio,
    rolamento: primeiro.rolamento,
    valor_bruto: valorTotal,
    desconto_pct: 0,
    valor_final: valorTotal,
    desconto_aprovado_por: null,
  };

  // itens_json: persianas (com snapshot) + cortinas (snapshot). Instalação embutida nos valores.
  const itensJson = (persProdIds: string[]) =>
    ({
      persiana: { tipo: persPrep[0].tipo, itens: snapshotsDe(persPrep, persProdIds) },
      cortinas: cortPrep.map((p) => p.snapshot),
    }) as unknown as Prisma.InputJsonValue;

  const persistir = (data: Prisma.OrcamentoUncheckedCreateInput) =>
    editarId
      ? prisma.orcamento.update({ where: { id: editarId }, data: data as Prisma.OrcamentoUncheckedUpdateInput })
      : prisma.orcamento.create({ data });

  // Apenas salvar: rascunho local, sem tocar no GestãoClick.
  if (apenasSalvar) {
    const orcamento = await persistir({ ...baseDados, status: 'rascunho', itens_json: itensJson([]) });
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_salvo_rascunho', detalhe: { orcamento_id: orcamento.id, tipo: 'misto', persianas: persPrep.length, cortinas: cortPrep.length, valor_final: valorTotal } } });
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
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_enviado_gc', detalhe: { orcamento_id: orcamento.id, tipo: 'misto', gc_orcamento_id: envio.gc_orcamento_id, persianas: persPrep.length, cortinas: cortPrep.length, valor_final: valorTotal } } });
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

interface CortinaSnap { nome_produto?: string; valor_total?: number; valor_custo?: number }
interface MistoItensJson { persiana?: { tipo: string; itens: ItemSnapshot[] }; cortinas?: CortinaSnap[]; instalacao?: number }

/** Reenvia um orçamento MISTO ao GestãoClick (replay do snapshot salvo). */
export async function reenviarMisto(orc: Orcamento, sessao: { id: string; gc_usuario_id: string | null }, res: Response): Promise<void> {
  const itens = orc.itens_json as unknown as MistoItensJson | null;
  const persSnaps = itens?.persiana?.itens ?? [];
  const cortSnaps = itens?.cortinas ?? [];
  if (persSnaps.length === 0 && cortSnaps.length === 0) throw new AppError(400, 'SEM_ITENS', 'Orçamento misto sem itens para reenviar.');
  const loja = await resolverLoja(orc.loja_id);

  const produtos: LinhaProduto[] = [
    ...persSnaps.map((s) => ({ nome_produto: s.nome_produto, valor_final: Number(s.valor_final), valor_custo: Number(s.valor_custo) })),
    ...cortSnaps.map((s) => ({ nome_produto: String(s.nome_produto ?? 'Cortina'), valor_final: Number(s.valor_total) || 0, valor_custo: Number(s.valor_custo) || 0 })),
  ];

  try {
    const envio = await executarEnvioGc({
      itens: produtos,
      gc_cliente_id: orc.gc_cliente_id!,
      gcVendedorId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });
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
