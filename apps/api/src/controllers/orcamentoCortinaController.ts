// apps/api/src/controllers/orcamentoCortinaController.ts
// Envio do orçamento de CORTINA ao GestãoClick (estágio 4, ver decisions §9.7).
// RECALCULA tudo no servidor (nunca confia no cliente): por cortina roda o motor
// multi-camada, lê os preços dos acessórios do GC e soma. Cada cortina vira 1
// produto sintético curto; detalhes técnicos seguem na descrição do produto.

import type { Request, Response } from 'express';
import { Prisma, type Orcamento } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { calcularCortinaMultiCamada, type CamadaCortina } from '../services/calc/cortina';
import { buscarTecidoCortinaGc } from '../services/gc/tecidos';
import { buscarAcessorioGc, categoriaDoItem, ehWaveFixo, resolverProdutoWaveFixo, type CategoriaAcessorio } from '../services/gc/acessorios';
import { indiceInstalacoes } from '../services/gc/instalacao';
import { valorComRt } from '../services/calc/rtCalc';
import { criarProduto, deletarProduto } from '../services/gc/produtos';
import { criarOrcamento as gcCriarOrcamento, type LinhaProdutoGc } from '../services/gc/orcamentos';
import { roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { AppError } from '../middleware/errorHandler';
import { resolverLoja } from '../lib/resolverLoja';
import { descricaoProdutoCortina, nomeProdutoCortina } from '../services/calc/cortinaProduto';

interface CamadaEntrada { nome?: string; tecido_id: string; franzido?: number | string; modelo?: 'ilhos' | 'prega' | 'franzido' | 'wave' | 'costurado_junto'; metodo_altura?: 'emenda' | 'barra_postica'; costurado_quantidade?: 'mesma_quantidade' | 'proporcao_franzido' }
interface AcessorioEntrada { item: string; produto_id?: string; quantidade?: number }
export interface CortinaEntrada {
  ambiente?: string;
  modelo_cortina_nome?: string;
  modelo: 'ilhos' | 'prega' | 'franzido' | 'wave';
  fixacao: 'varao' | 'trilho' | 'varao_suico';
  desconto?: 'teto_ao_chao' | 'gesso_ao_chao' | 'sem_desconto' | 'varao_ao_chao' | 'suporte_de_teto';
  largura: number | string;
  altura: number | string;
  tamanho_barra?: number | string;
  tipo_barra?: 'simples' | 'dupla';
  aberturas?: number | string;
  bainhas_laterais?: number | string;
  camadas: CamadaEntrada[];
  acessorios: AcessorioEntrada[];
  ja_possui_varao?: boolean; // cliente já tem o trilho/varão → não inclui
  instalacao_id?: string | null; // tipo de instalação (grupo INSTALAÇÃO) embutido no produto
}

export interface CortinaPreparada {
  ambiente: string;
  nome_produto: string;
  descricao_produto: string;
  valor_total: number;
  valor_custo: number;
  snapshot: Record<string, unknown>;
  largura: number;
  altura: number;
  tecido_id: string;
  tecido_nome: string;
}

/** Recalcula UMA cortina no servidor (tecido + acessórios) e devolve o preparado. */
export async function prepararCortina(c: CortinaEntrada): Promise<CortinaPreparada> {
  const largura = Number(c.largura);
  const altura = Number(c.altura);
  if (!(largura > 0) || !(altura > 0)) throw new AppError(400, 'MEDIDAS_INVALIDAS', 'Largura e altura devem ser positivas.');
  if (!Array.isArray(c.camadas) || c.camadas.length < 1 || c.camadas.length > 3) {
    throw new AppError(400, 'CAMADAS_INVALIDAS', 'Cada cortina deve ter de 1 a 3 tecidos (camadas).');
  }

  // Resolve os tecidos das camadas.
  const tecidos = [] as NonNullable<Awaited<ReturnType<typeof buscarTecidoCortinaGc>>>[];
  for (const cam of c.camadas) {
    const t = await buscarTecidoCortinaGc(String(cam.tecido_id));
    if (!t) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido em todas as camadas.');
    tecidos.push(t);
  }

  const camadasCalc: CamadaCortina[] = c.camadas.map((cam, i) => ({
    largura_tecido: tecidos[i]!.dimensao_m,
    franzido: cam.franzido !== undefined && cam.franzido !== '' ? Number(cam.franzido) : undefined,
    modelo: cam.modelo, // modelo PRÓPRIO da camada (Victor v.4.1: frente wave + fundo franzido)
    metodo_altura: cam.metodo_altura,
    costurado_quantidade: cam.costurado_quantidade,
  }));

  const r = calcularCortinaMultiCamada({
    modelo: c.modelo ?? camadasCalc[0]?.modelo, fixacao: c.fixacao, largura, altura, camadas: camadasCalc,
    tamanho_barra: c.tamanho_barra !== undefined && c.tamanho_barra !== '' ? Number(c.tamanho_barra) : undefined,
    tipo_barra: c.tipo_barra,
    aberturas: c.aberturas !== undefined && c.aberturas !== '' ? Number(c.aberturas) : undefined,
    bainhas_laterais: c.bainhas_laterais !== undefined && c.bainhas_laterais !== '' ? Number(c.bainhas_laterais) : undefined,
  });

  const nomeCamada = (i: number) => String(c.camadas[i]?.nome ?? '').trim() || (i === 0 ? 'Frente' : `Camada ${i + 1}`);

  // Tecido (SOB MEDIDA): por camada.
  let valorTotal = 0;
  let valorCusto = 0;
  const camadasSnap = r.camadas.map((cam, i) => {
    const t = tecidos[i]!;
    const vt = roundHalfUp(cam.metragem * t.preco_venda);
    valorTotal = roundHalfUp(valorTotal + vt);
    valorCusto = roundHalfUp(valorCusto + cam.metragem * t.preco_custo);
    return { 
      tecido_id: t.id, 
      nome: nomeCamada(i),
      tecido_nome: t.nome, 
      modelo: c.camadas[i]?.modelo ?? c.modelo,
      metragem: cam.metragem, 
      valor_tecido: vt, 
      metodo: cam.metodo, 
      altura_excede_tecido: cam.altura_excede_tecido,
      tiras: cam.tiras, 
      barra_consumo: cam.barra_consumo,
      barra_postica_base: cam.barra_postica_base,
      barra_postica_acrescimo: cam.barra_postica_acrescimo,
      bainhas_laterais_acrescimo: cam.bainhas_laterais_acrescimo,
      consumo: cam.consumo,
      costurado_junto: cam.costurado_junto === true,
      costurado_quantidade: cam.costurado_quantidade ?? null
    };
  });

  // Nome do item da barra (trilho/varão) conforme a fixação — para o "Já possui".
  // O varão pode vir por camada ("Varão (camada N)"), então casa pela base do nome.
  const nomeBarra = c.fixacao === 'trilho' ? 'Trilho' : c.fixacao === 'varao_suico' ? 'Varão suíço' : 'Varão';
  const ehBarra = (item: string) => item === nomeBarra || item.startsWith(`${nomeBarra} (camada `);

  // Acessórios: preço do GC × quantidade (auto do motor; manual do cliente, ex.: suporte).
  const acessoriosSnap: Record<string, unknown>[] = [];
  for (const a of r.acessorios) {
    if (c.ja_possui_varao && ehBarra(a.item)) continue; // cliente já tem o trilho/varão
    const entrada = (c.acessorios ?? []).find((x) => x.item === a.item);
    const qtd = a.auto ? a.quantidade : Number(entrada?.quantidade ?? 0);
    // Item manual (ex.: Suporte) com quantidade 0 → não incluir no orçamento (Victor v.3.1).
    if (!a.auto && !(qtd > 0)) continue;

    let categoria: CategoriaAcessorio | null;
    let prod: { id: string; nome: string; preco: number } | null;
    if (ehWaveFixo(a.item)) {
      // Itens obrigatórios do wave (Victor v.4.1): o servidor resolve o produto (sem seleção).
      categoria = 'wave';
      prod = await resolverProdutoWaveFixo(a.item);
      if (!prod) throw new AppError(400, 'WAVE_PRODUTO', `Produto do wave "${a.item}" não encontrado no GestãoClick.`);
    } else {
      categoria = categoriaDoItem(a.item, c.fixacao) as CategoriaAcessorio | null;
      const produtoId = entrada?.produto_id ?? '';
      if (!categoria || !produtoId) {
        throw new AppError(400, 'ACESSORIO_SEM_PRODUTO', `Escolha o produto do acessório "${a.item}".`);
      }
      prod = await buscarAcessorioGc(categoria, produtoId);
      if (!prod) throw new AppError(400, 'ACESSORIO_INVALIDO', `Produto inválido para "${a.item}".`);
    }
    if (!(qtd > 0)) throw new AppError(400, 'ACESSORIO_QTD', `Quantidade inválida para "${a.item}".`);
    const subtotal = roundHalfUp(prod.preco * qtd);
    valorTotal = roundHalfUp(valorTotal + subtotal);
    acessoriosSnap.push({ item: a.item, categoria, produto_id: prod.id, produto_nome: prod.nome, quantidade: qtd, preco: prod.preco, subtotal });
  }

  // Instalação embutida (Victor 26/06/2026): tipo escolhido por cortina, do grupo
  // INSTALAÇÃO; entra como componente no valor do produto (sem linha de serviço).
  if (c.instalacao_id) {
    const inst = (await indiceInstalacoes()).get(String(c.instalacao_id));
    if (inst) {
      valorTotal = roundHalfUp(valorTotal + inst.preco);
      valorCusto = roundHalfUp(valorCusto + inst.custo);
      acessoriosSnap.push({ item: 'Instalação', categoria: 'instalacao', produto_id: inst.id, produto_nome: inst.nome, quantidade: 1, preco: inst.preco, subtotal: inst.preco });
    }
  }

  const nomeProduto = nomeProdutoCortina({
    ambiente: c.ambiente,
    modelo_cortina_nome: c.modelo_cortina_nome,
    modelo_fallback: c.modelo,
    largura,
    altura,
  });
  const descricaoProduto = descricaoProdutoCortina({
    fixacao: c.fixacao,
    aberturas: c.aberturas,
    camadas: camadasSnap.map((cs, i) => ({
      modelo: c.camadas[i]?.modelo ?? c.modelo,
      nome: cs.nome,
      tecido_nome: cs.tecido_nome,
      franzido: c.camadas[i]?.franzido,
      costurado_junto: c.camadas[i]?.modelo === 'costurado_junto',
      costurado_quantidade: c.camadas[i]?.costurado_quantidade,
    })),
  });

  return {
    ambiente: c.ambiente?.trim() || '',
    nome_produto: nomeProduto,
    descricao_produto: descricaoProduto,
    valor_total: valorTotal,
    valor_custo: valorCusto,
    largura, altura,
    tecido_id: camadasSnap[0].tecido_id,
    tecido_nome: camadasSnap[0].tecido_nome,
    snapshot: { ambiente: c.ambiente?.trim() || '', modelo_cortina_nome: c.modelo_cortina_nome ?? null, modelo: c.modelo, fixacao: c.fixacao, desconto: c.desconto ?? 'sem_desconto', abertura: c.aberturas ?? null, bainhas_laterais: c.bainhas_laterais ?? null, largura, altura, n_camadas: r.n_camadas, camadas: camadasSnap, acessorios: acessoriosSnap, valor_total: valorTotal, nome_produto: nomeProduto, descricao_produto: descricaoProduto, valor_custo: valorCusto },
  };
}

/** POST /api/orcamentos/cortina — cria o orçamento de cortina (vários ambientes; instalação embutida). */
export async function criarOrcamentoCortina(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const b = req.body ?? {};
  const apenasSalvar = b.apenas_salvar === true;

  const cortinasEntrada: CortinaEntrada[] = Array.isArray(b.cortinas) ? b.cortinas : [];
  if (cortinasEntrada.length === 0) throw new AppError(400, 'SEM_ITENS', 'Adicione ao menos uma cortina.');
  if (!apenasSalvar && (!b.gc_cliente_id || !b.nome_cliente)) {
    throw new AppError(400, 'CLIENTE_OBRIGATORIO', 'Selecione um cliente.');
  }

  // editar_id = reabrir um rascunho de cortina na calculadora e regravar no MESMO registro.
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

  // Recalcula cada cortina no servidor.
  const preparadas: CortinaPreparada[] = [];
  for (const c of cortinasEntrada) preparadas.push(await prepararCortina(c));

  // RT do arquiteto (Victor 27/06/2026): gross-up embutido no valor de venda de cada
  // cortina (custo inalterado). % vale para o orçamento todo.
  const rtPct = Math.max(0, Math.min(99, Number(b.rt_pct) || 0));
  if (rtPct > 0) {
    for (const p of preparadas) {
      p.valor_total = valorComRt(p.valor_total, rtPct);
      (p.snapshot as { valor_total?: number }).valor_total = p.valor_total;
    }
  }
  // Instalação e RT já estão embutidos no valor de cada cortina.
  const valorTotal = roundHalfUp(preparadas.reduce((s, p) => s + p.valor_total, 0));
  const lojaIdOrcamento = sessao.perfil === 'admin'
    ? (b.loja_id ?? editarOrc?.loja_id ?? sessao.loja_id)
    : (editarOrc?.loja_id ?? sessao.loja_id);
  const loja = await resolverLoja(lojaIdOrcamento);
  const primeira = preparadas[0];

  // Grava: cria novo ou atualiza o rascunho em edição (mesmo registro).
  const persistir = (data: Prisma.OrcamentoUncheckedCreateInput) =>
    editarId
      ? prisma.orcamento.update({ where: { id: editarId }, data: data as Prisma.OrcamentoUncheckedUpdateInput })
      : prisma.orcamento.create({ data });

  const baseDados = {
    tipo_produto: 'cortina' as const,
    usuario_id: editarOrc?.usuario_id ?? sessao.id,
    loja_id: loja.id,
    entrada_json: { cortinas: cortinasEntrada, rt_pct: rtPct } as unknown as Prisma.InputJsonValue,
    nome_cliente: b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)',
    gc_cliente_id: b.gc_cliente_id ? String(b.gc_cliente_id) : null,
    tecido_codigo_gc: primeira.tecido_id,
    tecido_nome: preparadas.length > 1 ? `${primeira.tecido_nome} (+${preparadas.length - 1})` : primeira.tecido_nome,
    largura_m: primeira.largura,
    altura_m: primeira.altura,
    valor_bruto: valorTotal,
    valor_final: valorTotal,
    itens_json: { cortinas: preparadas.map((p) => p.snapshot) } as unknown as Prisma.InputJsonValue,
  };

  // Apenas salvar: rascunho local, sem tocar no GestãoClick.
  if (apenasSalvar) {
    const orcamento = await persistir({ ...baseDados, status: 'rascunho' });
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_salvo_rascunho', detalhe: { orcamento_id: orcamento.id, tipo: 'cortina', cortinas: preparadas.length, valor_final: valorTotal } } });
    res.status(201).json({ orcamento });
    return;
  }

  // Monta produtos (1 por cortina) + serviço de instalação e envia.
  const usados: string[] = [];
  const criados: string[] = [];
  try {
    const linhas: LinhaProdutoGc[] = [];
    for (const p of preparadas) {
      const produto = await criarProduto({ nome: p.nome_produto, descricao: p.descricao_produto, valor_custo: p.valor_custo, valor_venda: p.valor_total });
      usados.push(produto.gc_produto_id);
      if (produto.criado) criados.push(produto.gc_produto_id);
      linhas.push({ gc_produto_id: produto.gc_produto_id, valor_venda: p.valor_total, valor_custo: p.valor_custo });
    }

    // Instalação embutida no valor de cada cortina (Victor 26/06/2026) — sem serviço.
    // Sem número: o GestãoClick gera o sequencial e devolve em orc.gc_codigo.
    const orc = await gcCriarOrcamento({
      cliente_id: String(b.gc_cliente_id),
      produtos: linhas,
      servicos: [],
      data: new Date().toISOString().slice(0, 10),
      usuario_id: env.GC_USUARIO_INTEGRACAO_ID || null,
      vendedor_id: sessao.gc_usuario_id,
      loja_id: loja.gc_loja_id,
    });

    const orcamento = await persistir({
      ...baseDados,
      status: 'enviado',
      gc_produto_id: usados[0] ?? null,
      gc_orcamento_id: orc.gc_orcamento_id,
      gc_codigo: orc.gc_codigo,
      payload_gc_enviado: orc.payload as Prisma.InputJsonValue,
      resposta_gc: orc.resposta as Prisma.InputJsonValue,
    });
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_enviado_gc', detalhe: { orcamento_id: orcamento.id, tipo: 'cortina', gc_orcamento_id: orc.gc_orcamento_id, cortinas: preparadas.length, valor_final: valorTotal } } });
    res.status(201).json({ orcamento });
  } catch (err) {
    // Limpa os produtos já criados no GC (best-effort).
    for (const id of criados) {
      try { await deletarProduto(id); } catch { /* ignora */ }
    }
    const gc = err instanceof GcError ? err : null;
    if (err instanceof AppError) throw err;
    const orcamento = await persistir({
      ...baseDados,
      status: 'erro',
      erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message),
      payload_gc_enviado: (gc?.payload as object as Prisma.InputJsonValue) ?? undefined,
    });
    res.status(502).json({ erro: { codigo: 'GC_ENVIO', message: gc?.message ?? 'Falha ao enviar ao GestãoClick' }, orcamento });
  }
}

interface CortinaSnapshot { nome_produto?: string; descricao_produto?: string; valor_total?: number; valor_custo?: number }

/**
 * Recalcula as cortinas a partir da ENTRADA salva (`entrada_json`), sem confiar nos
 * valores do snapshot. Usado no reenvio para garantir que o valor enviado ao
 * GestãoClick venha sempre de recálculo no servidor com preços atuais (RN-10).
 */
export async function recalcularCortinasDeEntrada(cortinas: CortinaEntrada[], rtPct: number): Promise<CortinaPreparada[]> {
  const preparadas: CortinaPreparada[] = [];
  for (const c of cortinas) preparadas.push(await prepararCortina(c));
  const pct = Math.max(0, Math.min(99, Number(rtPct) || 0));
  if (pct > 0) {
    for (const p of preparadas) {
      p.valor_total = valorComRt(p.valor_total, pct);
      (p.snapshot as { valor_total?: number }).valor_total = p.valor_total;
    }
  }
  return preparadas;
}

/** Reenvia um rascunho/erro de CORTINA ao GestãoClick (recalcula da entrada; snapshot é fallback legado). */
export async function reenviarCortina(orc: Orcamento, sessao: { id: string; gc_usuario_id: string | null }, res: Response): Promise<void> {
  const entrada = orc.entrada_json as { cortinas?: CortinaEntrada[]; rt_pct?: number } | null;
  const recalcular = Array.isArray(entrada?.cortinas) && entrada!.cortinas!.length > 0;
  const snapCortinas = (orc.itens_json as { cortinas?: CortinaSnapshot[] } | null)?.cortinas ?? [];
  if (!recalcular && snapCortinas.length === 0) throw new AppError(400, 'SEM_ITENS', 'Orçamento de cortina sem itens para enviar.');
  const loja = await resolverLoja(orc.loja_id);

  const usados: string[] = [];
  const criados: string[] = [];
  try {
    // Recalcula a partir da entrada (preferido); cai para o snapshot só em registros legados.
    const preparadas = recalcular ? await recalcularCortinasDeEntrada(entrada!.cortinas!, Number(entrada!.rt_pct) || 0) : null;
    const fonte = preparadas
      ? preparadas.map((p) => ({ nome_produto: p.nome_produto, descricao_produto: p.descricao_produto, valor_total: p.valor_total, valor_custo: p.valor_custo }))
      : snapCortinas.map((c) => ({ nome_produto: String(c.nome_produto ?? 'Cortina'), descricao_produto: c.descricao_produto ? String(c.descricao_produto) : undefined, valor_total: Number(c.valor_total) || 0, valor_custo: Number(c.valor_custo) || 0 }));

    const linhas: LinhaProdutoGc[] = [];
    for (const f of fonte) {
      const produto = await criarProduto({ nome: f.nome_produto, descricao: f.descricao_produto, valor_custo: f.valor_custo, valor_venda: f.valor_total });
      usados.push(produto.gc_produto_id);
      if (produto.criado) criados.push(produto.gc_produto_id);
      linhas.push({ gc_produto_id: produto.gc_produto_id, valor_venda: f.valor_total, valor_custo: f.valor_custo });
    }
    // Instalação embutida no valor de cada cortina (Victor 26/06/2026) — sem serviço.
    const gcOrc = await gcCriarOrcamento({
      cliente_id: orc.gc_cliente_id!,
      produtos: linhas,
      servicos: [],
      data: new Date().toISOString().slice(0, 10),
      usuario_id: env.GC_USUARIO_INTEGRACAO_ID || null,
      vendedor_id: sessao.gc_usuario_id,
      loja_id: loja.gc_loja_id,
    });
    const novoTotal = preparadas ? roundHalfUp(preparadas.reduce((s, p) => s + p.valor_total, 0)) : null;
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: {
        status: 'enviado',
        gc_produto_id: usados[0] ?? null,
        gc_orcamento_id: gcOrc.gc_orcamento_id,
        gc_codigo: gcOrc.gc_codigo,
        payload_gc_enviado: gcOrc.payload as Prisma.InputJsonValue,
        resposta_gc: gcOrc.resposta as Prisma.InputJsonValue,
        erro_gc: null,
        ...(preparadas ? { itens_json: { cortinas: preparadas.map((p) => p.snapshot) } as unknown as Prisma.InputJsonValue } : {}),
        ...(novoTotal !== null ? { valor_bruto: novoTotal, valor_final: novoTotal } : {}),
      },
    });
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_reenviado', detalhe: { orcamento_id: orc.id, tipo: 'cortina' } } });
    res.json({ orcamento: atualizado });
  } catch (err) {
    for (const id of criados) { try { await deletarProduto(id); } catch { /* ignora */ } }
    if (err instanceof AppError) throw err;
    const gc = err instanceof GcError ? err : null;
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: { status: 'erro', erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message) },
    });
    res.status(502).json({ erro: { codigo: 'GC_ENVIO', message: gc?.message ?? 'Falha ao enviar ao GestãoClick' }, orcamento: atualizado });
  }
}
