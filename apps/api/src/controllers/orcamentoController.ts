// apps/api/src/controllers/orcamentoController.ts
// Envio de orçamento ao GestãoClick (SRD §11, Fase 5).
// Fluxo: recalcula no servidor (RN-10 valor exato) → POST produto → POST orçamento
// → salva local. Erros do GC salvam status='erro' para reenvio posterior.

import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { calcularPersiana, aplicarDesconto } from '../services/calc/persiana';
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
import { criarOrcamento as gcCriarOrcamento } from '../services/gc/orcamentos';
import { roundHalfUp } from '../services/calc/arredondamento';
import { GcError } from '../services/gc/client';
import { AppError } from '../middleware/errorHandler';

interface EntradaEnvio {
  tipo: TipoPersiana;
  largura: number;
  altura: number;
  cor_acessorio: Cor;
  acionamento: Acionamento;
  tc?: number;
  rolamento?: string;
  desconto_pct: number;
  cliente_id: string;
  nome_cliente: string;
  gc_cliente_id: string;
}

/** Resolve a loja interna + gc_loja_id para o usuário (admin → loja matriz/SP). */
async function resolverLoja(lojaIdUsuario: string | null) {
  if (lojaIdUsuario) {
    const loja = await prisma.loja.findUnique({ where: { id: lojaIdUsuario } });
    if (loja) return loja;
  }
  const matriz = await prisma.loja.findFirst({ orderBy: { nome: 'asc' } });
  if (!matriz) throw new AppError(500, 'SEM_LOJA', 'Nenhuma loja cadastrada.');
  return matriz;
}

/** Executa o envio ao GestãoClick (produto + orçamento) com limpeza de órfão. */
async function executarEnvioGc(args: {
  entrada: EntradaEnvio;
  tecido: TecidoGc;
  valorBruto: number;
  valorFinal: number;
  qtdVenda: number;
  gcUsuarioId: string | null;
  gcLojaId: string | null;
}) {
  const { entrada, tecido, valorFinal, qtdVenda, gcUsuarioId, gcLojaId } = args;

  const nomeProduto = `${TIPO_LABEL[entrada.tipo]} - ${tecido.nome} - ${entrada.largura.toFixed(2)}x${entrada.altura.toFixed(2)} - ${entrada.cor_acessorio} - ${ACIONAMENTO_LABEL[entrada.acionamento]}`.slice(0, 120);
  const valorCusto = roundHalfUp(qtdVenda * tecido.preco_custo);

  const produto = await criarProduto({
    nome: nomeProduto,
    valor_custo: valorCusto,
    valor_venda: valorFinal,
  });

  try {
    const orc = await gcCriarOrcamento({
      codigo: Math.floor(Date.now() / 1000),
      cliente_id: entrada.gc_cliente_id,
      gc_produto_id: produto.gc_produto_id,
      valor_final: valorFinal,
      valor_custo: valorCusto,
      data: new Date().toISOString().slice(0, 10),
      usuario_id: gcUsuarioId,
      loja_id: gcLojaId,
    });
    return {
      gc_produto_id: produto.gc_produto_id,
      gc_orcamento_id: orc.gc_orcamento_id,
      payload: { produto: produto.payload, orcamento: orc.payload },
      resposta: orc.resposta,
      valorCusto,
    };
  } catch (err) {
    // Orçamento falhou → remove o produto órfão criado (best-effort, não polui o GC).
    try {
      await deletarProduto(produto.gc_produto_id);
    } catch {
      /* ignora falha de limpeza */
    }
    throw err;
  }
}

export async function criarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const b = req.body ?? {};

  if (!isTipoPersiana(b.tipo)) throw new AppError(400, 'TIPO_INVALIDO', 'Tipo de persiana inválido.');
  const largura = Number(b.largura);
  const altura = Number(b.altura);
  if (!(largura > 0) || !(altura > 0)) {
    throw new AppError(400, 'MEDIDAS_INVALIDAS', 'Largura e altura devem ser positivas.');
  }
  if (!b.gc_cliente_id || !b.nome_cliente) {
    throw new AppError(400, 'CLIENTE_OBRIGATORIO', 'Selecione um cliente.');
  }

  const desconto_pct = Number(b.desconto_pct ?? 0);
  // RN-08: desconto acima do limite exige aprovação de gerente (senha de admin).
  let descontoAprovadoPor: string | null = null;
  if (desconto_pct > Number(sessao.desconto_max_pct)) {
    const senhaGerente = typeof b.senha_gerente === 'string' ? b.senha_gerente : '';
    if (!senhaGerente) {
      throw new AppError(403, 'APROVACAO_NECESSARIA', 'Desconto acima do limite exige aprovação do gerente.');
    }
    const admin = await verificarSenhaGerente(senhaGerente);
    if (!admin) {
      throw new AppError(401, 'SENHA_GERENTE_INVALIDA', 'Senha de gerente incorreta.');
    }
    descontoAprovadoPor = admin.id;
  }

  const tecido = await buscarTecidoGc(String(b.tecido_id));
  if (!tecido) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido.');

  // Recalcula no servidor — nunca confia no valor do cliente (RN-10).
  const calc = calcularPersiana({
    tipo: b.tipo,
    largura,
    altura,
    dimensao: tecido.dimensao_m,
    cor_acessorio: b.cor_acessorio,
    acionamento: b.acionamento,
    tc: b.tc !== undefined && b.tc !== null && b.tc !== '' ? Number(b.tc) : undefined,
    preco_tecido: tecido.preco_venda,
  });
  const valorBruto = calc.valor_bruto!;
  const valorFinal = aplicarDesconto(valorBruto, desconto_pct);

  const loja = await resolverLoja(sessao.loja_id);

  const entrada: EntradaEnvio = {
    tipo: b.tipo,
    largura,
    altura,
    cor_acessorio: b.cor_acessorio,
    acionamento: b.acionamento,
    tc: calc.tc,
    rolamento: b.rolamento,
    desconto_pct,
    cliente_id: String(b.gc_cliente_id),
    nome_cliente: String(b.nome_cliente),
    gc_cliente_id: String(b.gc_cliente_id),
  };

  // Dados comuns ao salvar (sucesso ou erro).
  const baseDados = {
    tipo_produto: b.tipo,
    usuario_id: sessao.id,
    loja_id: loja.id,
    nome_cliente: entrada.nome_cliente,
    gc_cliente_id: entrada.gc_cliente_id,
    tecido_codigo_gc: tecido.id,
    tecido_nome: tecido.nome,
    largura_m: largura,
    altura_m: altura,
    dimensao_m: tecido.dimensao_m,
    tc_m: calc.tc,
    acionamento: b.acionamento,
    cor_acessorio: b.cor_acessorio,
    rolamento: b.rolamento ?? null,
    valor_bruto: valorBruto,
    desconto_pct,
    valor_final: valorFinal,
    desconto_aprovado_por: descontoAprovadoPor,
  };

  try {
    const envio = await executarEnvioGc({
      entrada,
      tecido,
      valorBruto,
      valorFinal,
      qtdVenda: calc.qtd_venda,
      gcUsuarioId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });

    const orcamento = await prisma.orcamento.create({
      data: {
        ...baseDados,
        status: 'enviado',
        gc_produto_id: envio.gc_produto_id,
        gc_orcamento_id: envio.gc_orcamento_id,
        payload_gc_enviado: envio.payload as Prisma.InputJsonValue,
        resposta_gc: envio.resposta as Prisma.InputJsonValue,
        itens: { create: montarItens(tecido, calc, valorBruto) },
      },
    });

    await prisma.logAcao.create({
      data: {
        usuario_id: sessao.id,
        acao: 'orcamento_enviado_gc',
        detalhe: { orcamento_id: orcamento.id, gc_orcamento_id: envio.gc_orcamento_id, valor_final: valorFinal },
      },
    });
    if (descontoAprovadoPor) {
      await prisma.logAcao.create({
        data: {
          usuario_id: descontoAprovadoPor,
          acao: 'desconto_aprovado',
          detalhe: { orcamento_id: orcamento.id, desconto_pct, aprovado_para: sessao.id },
        },
      });
    }

    res.status(201).json({ orcamento });
  } catch (err) {
    const gc = err instanceof GcError ? err : null;
    const orcamento = await prisma.orcamento.create({
      data: {
        ...baseDados,
        status: 'erro',
        erro_gc: gc ? `HTTP ${gc.status}: ${gc.message}` : String((err as Error).message),
        payload_gc_enviado: (gc?.payload as object) ?? undefined,
        itens: { create: montarItens(tecido, calc, valorBruto) },
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

/** Monta os itens_orcamento (snapshot): tecido (com preço) + componentes (produção). */
function montarItens(
  tecido: TecidoGc,
  calc: ReturnType<typeof calcularPersiana>,
  valorBruto: number,
) {
  return [
    {
      descricao: tecido.nome,
      quantidade: calc.qtd_venda,
      unidade: 'm2',
      preco_unitario: tecido.preco_venda,
      valor_total: valorBruto,
    },
    ...calc.componentes.map((c) => ({
      descricao: c.descricao,
      quantidade: c.quantidade,
      unidade: c.unidade,
      preco_unitario: 0,
      valor_total: 0,
    })),
  ];
}

export async function reenviarOrcamento(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({ where: { id: String(req.params.id) } });
  if (!orc) throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  if (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id) {
    throw new AppError(403, 'ACESSO_NEGADO', 'Sem permissão para reenviar este orçamento.');
  }
  if (!orc.gc_cliente_id) throw new AppError(400, 'SEM_CLIENTE', 'Orçamento sem cliente vinculado.');

  const tecido = await buscarTecidoGc(orc.tecido_codigo_gc);
  if (!tecido) throw new AppError(400, 'TECIDO_INVALIDO', 'Tecido não encontrado no GestãoClick.');

  const calc = calcularPersiana({
    tipo: orc.tipo_produto as TipoPersiana,
    largura: Number(orc.largura_m),
    altura: Number(orc.altura_m),
    dimensao: tecido.dimensao_m,
    cor_acessorio: (orc.cor_acessorio ?? 'Branco') as Cor,
    acionamento: (orc.acionamento ?? 'com_bando') as Acionamento,
    tc: orc.tc_m ? Number(orc.tc_m) : undefined,
    preco_tecido: tecido.preco_venda,
  });
  const valorFinal = Number(orc.valor_final);

  const loja = await resolverLoja(orc.loja_id);

  try {
    const envio = await executarEnvioGc({
      entrada: {
        tipo: orc.tipo_produto as TipoPersiana,
        largura: Number(orc.largura_m),
        altura: Number(orc.altura_m),
        cor_acessorio: (orc.cor_acessorio ?? 'Branco') as Cor,
        acionamento: (orc.acionamento ?? 'com_bando') as Acionamento,
        desconto_pct: Number(orc.desconto_pct),
        cliente_id: orc.gc_cliente_id,
        nome_cliente: orc.nome_cliente,
        gc_cliente_id: orc.gc_cliente_id,
      },
      tecido,
      valorBruto: Number(orc.valor_bruto),
      valorFinal,
      qtdVenda: calc.qtd_venda,
      gcUsuarioId: sessao.gc_usuario_id,
      gcLojaId: loja.gc_loja_id,
    });

    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: {
        status: 'enviado',
        gc_produto_id: envio.gc_produto_id,
        gc_orcamento_id: envio.gc_orcamento_id,
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

/** Verifica se a senha corresponde a algum usuário admin ativo. Retorna o admin ou null. */
async function verificarSenhaGerente(senha: string): Promise<{ id: string } | null> {
  const admins = await prisma.usuario.findMany({ where: { perfil: 'admin', ativo: true } });
  for (const a of admins) {
    if (bcrypt.compareSync(senha, a.senha_hash)) return { id: a.id };
  }
  return null;
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
