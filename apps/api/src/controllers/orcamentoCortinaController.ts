// apps/api/src/controllers/orcamentoCortinaController.ts
// Envio do orçamento de CORTINA ao GestãoClick (estágio 4, ver decisions §9.7).
// RECALCULA tudo no servidor (nunca confia no cliente): por cortina roda o motor
// multi-camada, lê os preços dos acessórios do GC e soma. Cada cortina vira 1
// produto sintético "MODELO • TECIDO • L×A"; a instalação vira 1 linha de serviço.

import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { calcularCortinaMultiCamada, type CamadaCortina } from '../services/calc/cortina';
import { buscarTecidoCortinaGc } from '../services/gc/tecidos';
import { buscarAcessorioGc, categoriaDoItem, type CategoriaAcessorio } from '../services/gc/acessorios';
import { listarServicos } from '../services/gc/catalogos';
import { criarProduto, deletarProduto } from '../services/gc/produtos';
import { criarOrcamento as gcCriarOrcamento, type LinhaProdutoGc, type LinhaServicoGc } from '../services/gc/orcamentos';
import { roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { AppError } from '../middleware/errorHandler';
import { resolverLoja } from './orcamentoController';
import { MODELOS_CORTINA_LABEL, TIPO_CAMADAS_LABEL } from '../services/calc/cortinaLabels';

interface CamadaEntrada { tecido_id: string; franzido?: number | string }
interface AcessorioEntrada { item: string; produto_id?: string; quantidade?: number }
interface CortinaEntrada {
  ambiente?: string;
  modelo: 'ilhos' | 'prega' | 'franzido' | 'wave';
  fixacao: 'varao' | 'trilho' | 'varao_suico';
  largura: number | string;
  altura: number | string;
  tamanho_barra?: number | string;
  tipo_barra?: 'simples' | 'dupla';
  camadas: CamadaEntrada[];
  acessorios: AcessorioEntrada[];
}

interface CortinaPreparada {
  ambiente: string;
  nome_produto: string;
  valor_total: number;
  valor_custo: number;
  snapshot: Record<string, unknown>;
  largura: number;
  altura: number;
  tecido_id: string;
  tecido_nome: string;
}

/** Recalcula UMA cortina no servidor (tecido + acessórios) e devolve o preparado. */
async function prepararCortina(c: CortinaEntrada): Promise<CortinaPreparada> {
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
  }));

  const r = calcularCortinaMultiCamada({
    modelo: c.modelo, fixacao: c.fixacao, largura, altura, camadas: camadasCalc,
    tamanho_barra: c.tamanho_barra !== undefined && c.tamanho_barra !== '' ? Number(c.tamanho_barra) : undefined,
    tipo_barra: c.tipo_barra,
  });

  // Tecido (SOB MEDIDA): por camada.
  let valorTotal = 0;
  let valorCusto = 0;
  const camadasSnap = r.camadas.map((cam, i) => {
    const t = tecidos[i]!;
    const vt = roundHalfUp(cam.metragem * t.preco_venda);
    valorTotal = roundHalfUp(valorTotal + vt);
    valorCusto = roundHalfUp(valorCusto + cam.metragem * t.preco_custo);
    return { tecido_id: t.id, tecido_nome: t.nome, metragem: cam.metragem, valor_tecido: vt };
  });

  // Acessórios: preço do GC × quantidade (auto do motor; manual do cliente, ex.: suporte).
  const acessoriosSnap: Record<string, unknown>[] = [];
  for (const a of r.acessorios) {
    const categoria = categoriaDoItem(a.item, c.fixacao) as CategoriaAcessorio | null;
    const entrada = (c.acessorios ?? []).find((x) => x.item === a.item);
    const produtoId = entrada?.produto_id ?? '';
    if (!categoria || !produtoId) {
      throw new AppError(400, 'ACESSORIO_SEM_PRODUTO', `Escolha o produto do acessório "${a.item}".`);
    }
    const prod = await buscarAcessorioGc(categoria, produtoId);
    if (!prod) throw new AppError(400, 'ACESSORIO_INVALIDO', `Produto inválido para "${a.item}".`);
    const qtd = a.auto ? a.quantidade : Number(entrada?.quantidade ?? 0);
    if (!(qtd > 0)) throw new AppError(400, 'ACESSORIO_QTD', `Quantidade inválida para "${a.item}".`);
    const subtotal = roundHalfUp(prod.preco * qtd);
    valorTotal = roundHalfUp(valorTotal + subtotal);
    acessoriosSnap.push({ item: a.item, categoria, produto_id: produtoId, produto_nome: prod.nome, quantidade: qtd, preco: prod.preco, subtotal });
  }

  const tipo = TIPO_CAMADAS_LABEL[r.n_camadas] ?? '';
  const modeloLabel = MODELOS_CORTINA_LABEL[c.modelo] ?? c.modelo;
  const nomeProduto = `${modeloLabel}${tipo ? ` ${tipo}` : ''} • ${camadasSnap[0].tecido_nome} • ${largura.toFixed(2)}×${altura.toFixed(2)}m`.slice(0, 100);

  return {
    ambiente: c.ambiente?.trim() || '',
    nome_produto: nomeProduto,
    valor_total: valorTotal,
    valor_custo: valorCusto,
    largura, altura,
    tecido_id: camadasSnap[0].tecido_id,
    tecido_nome: camadasSnap[0].tecido_nome,
    snapshot: { ambiente: c.ambiente?.trim() || '', modelo: c.modelo, fixacao: c.fixacao, largura, altura, n_camadas: r.n_camadas, camadas: camadasSnap, acessorios: acessoriosSnap, valor_total: valorTotal },
  };
}

/** Resolve o id do serviço de instalação (o informado ou o 1º "INSTALAÇÃO"). */
async function resolverServicoInstalacao(servicoId: string | undefined): Promise<string | null> {
  const servicos = await listarServicos();
  if (servicoId && servicos.some((s) => s.id === String(servicoId))) return String(servicoId);
  const inst = servicos.find((s) => /instala/i.test(s.nome));
  return inst ? inst.id : null;
}

/** POST /api/orcamentos/cortina — cria o orçamento de cortina (vários ambientes + instalação). */
export async function criarOrcamentoCortina(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const b = req.body ?? {};
  const apenasSalvar = b.apenas_salvar === true;

  const cortinasEntrada: CortinaEntrada[] = Array.isArray(b.cortinas) ? b.cortinas : [];
  if (cortinasEntrada.length === 0) throw new AppError(400, 'SEM_ITENS', 'Adicione ao menos uma cortina.');
  if (!apenasSalvar && (!b.gc_cliente_id || !b.nome_cliente)) {
    throw new AppError(400, 'CLIENTE_OBRIGATORIO', 'Selecione um cliente.');
  }

  // Recalcula cada cortina no servidor.
  const preparadas: CortinaPreparada[] = [];
  for (const c of cortinasEntrada) preparadas.push(await prepararCortina(c));

  const valorCortinas = roundHalfUp(preparadas.reduce((s, p) => s + p.valor_total, 0));
  const valorInstalacao = Math.max(0, Number(b.instalacao_valor) || 0);
  const valorTotal = roundHalfUp(valorCortinas + valorInstalacao);
  const loja = await resolverLoja(sessao.loja_id);
  const primeira = preparadas[0];

  const baseDados = {
    tipo_produto: 'cortina' as const,
    usuario_id: sessao.id,
    loja_id: loja.id,
    nome_cliente: b.nome_cliente ? String(b.nome_cliente) : '(sem cliente)',
    gc_cliente_id: b.gc_cliente_id ? String(b.gc_cliente_id) : null,
    tecido_codigo_gc: primeira.tecido_id,
    tecido_nome: preparadas.length > 1 ? `${primeira.tecido_nome} (+${preparadas.length - 1})` : primeira.tecido_nome,
    largura_m: primeira.largura,
    altura_m: primeira.altura,
    valor_bruto: valorTotal,
    desconto_pct: 0,
    valor_final: valorTotal,
    desconto_aprovado_por: null,
    itens_json: { cortinas: preparadas.map((p) => p.snapshot), instalacao: valorInstalacao } as unknown as Prisma.InputJsonValue,
  };

  // Apenas salvar: rascunho local, sem tocar no GestãoClick.
  if (apenasSalvar) {
    const orcamento = await prisma.orcamento.create({ data: { ...baseDados, status: 'rascunho' } });
    await prisma.logAcao.create({ data: { usuario_id: sessao.id, acao: 'orcamento_salvo_rascunho', detalhe: { orcamento_id: orcamento.id, tipo: 'cortina', cortinas: preparadas.length, valor_final: valorTotal } } });
    res.status(201).json({ orcamento });
    return;
  }

  // Monta produtos (1 por cortina) + serviço de instalação e envia.
  const criados: string[] = [];
  try {
    const linhas: LinhaProdutoGc[] = [];
    for (const p of preparadas) {
      const produto = await criarProduto({ nome: p.nome_produto, valor_custo: p.valor_custo, valor_venda: p.valor_total });
      criados.push(produto.gc_produto_id);
      linhas.push({ gc_produto_id: produto.gc_produto_id, valor_venda: p.valor_total, valor_custo: p.valor_custo });
    }

    const servicos: LinhaServicoGc[] = [];
    if (valorInstalacao > 0) {
      const servicoId = await resolverServicoInstalacao(b.instalacao_servico_id);
      if (!servicoId) throw new AppError(400, 'SERVICO_INSTALACAO', 'Nenhum serviço de instalação encontrado no GestãoClick.');
      servicos.push({ gc_servico_id: servicoId, valor_venda: valorInstalacao });
    }

    const orc = await gcCriarOrcamento({
      codigo: Math.floor(Date.now() / 1000),
      cliente_id: String(b.gc_cliente_id),
      produtos: linhas,
      servicos,
      data: new Date().toISOString().slice(0, 10),
      usuario_id: env.GC_USUARIO_INTEGRACAO_ID || null,
      vendedor_id: sessao.gc_usuario_id,
      loja_id: loja.gc_loja_id,
    });

    const orcamento = await prisma.orcamento.create({
      data: {
        ...baseDados,
        status: 'enviado',
        gc_produto_id: criados[0] ?? null,
        gc_orcamento_id: orc.gc_orcamento_id,
        payload_gc_enviado: orc.payload as Prisma.InputJsonValue,
        resposta_gc: orc.resposta as Prisma.InputJsonValue,
      },
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
    const orcamento = await prisma.orcamento.create({
      data: {
        ...baseDados,
        status: 'erro',
        erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message),
        payload_gc_enviado: (gc?.payload as object) ?? undefined,
      },
    });
    res.status(502).json({ erro: { codigo: 'GC_ENVIO', message: gc?.message ?? 'Falha ao enviar ao GestãoClick' }, orcamento });
  }
}
