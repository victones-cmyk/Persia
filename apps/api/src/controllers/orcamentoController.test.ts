import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  prisma: {
    orcamento: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    logAcao: {
      create: vi.fn(),
    },
  },
  resolverLoja: vi.fn(),
  buscarTecidoGc: vi.fn(),
  mapasDePrecoComponentes: vi.fn(),
  precoPersianaItem: vi.fn(),
  componentesSnapshot: vi.fn(),
  indiceInstalacoes: vi.fn(),
  encontrarCalculadora: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../config/env', () => ({ env: { GC_USUARIO_INTEGRACAO_ID: null } }));
vi.mock('../lib/resolverLoja', () => ({ resolverLoja: mocks.resolverLoja }));
vi.mock('../services/gc/tecidos', () => ({ buscarTecidoGc: mocks.buscarTecidoGc }));
vi.mock('../services/gc/instalacao', () => ({ indiceInstalacoes: mocks.indiceInstalacoes }));
vi.mock('../services/calc/persianaPrecoGc', () => ({
  mapasDePrecoComponentes: mocks.mapasDePrecoComponentes,
  precoPersianaItem: mocks.precoPersianaItem,
  componentesSnapshot: mocks.componentesSnapshot,
}));
vi.mock('../services/calc/persianaPreco', () => ({
  ReceitaPendenteError: class ReceitaPendenteError extends Error {},
}));
vi.mock('../services/calc/calculadoras', () => ({
  encontrarCalculadora: mocks.encontrarCalculadora,
  exigeLarguraTecido: vi.fn(() => true),
}));
vi.mock('../services/gc/produtos', () => ({ criarProduto: vi.fn(), deletarProduto: vi.fn() }));
vi.mock('../services/gc/orcamentos', () => ({ criarOrcamento: vi.fn() }));

import { criarOrcamento, duplicarOrcamento } from './orcamentoController';

function makeReq(perfil: 'admin' | 'vendedor', lojaSessao: string | null, lojaBody: string | undefined): Request {
  return {
    session: {
      usuario: {
        id: `${perfil}-1`,
        perfil,
        gc_usuario_id: 'gc-vendedor-1',
        loja_id: lojaSessao,
      },
    },
    body: {
      apenas_salvar: true,
      loja_id: lojaBody,
      tipo: 'persiana_rolo_blackout',
      nome_cliente: 'Cliente Teste',
      itens: [{
        tipo: 'persiana_rolo_blackout',
        tecido_id: 'tecido-1',
        cor_acessorio: 'Branco',
        acionamento: 'sem_bando',
        largura: 1,
        altura: 1,
      }],
    },
  } as unknown as Request;
}

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('criarOrcamento loja_id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.orcamento.findUnique.mockResolvedValue(null);
    mocks.prisma.orcamento.create.mockImplementation(async ({ data }) => ({ id: 'orc-1', ...data }));
    mocks.prisma.logAcao.create.mockResolvedValue({});
    mocks.resolverLoja.mockImplementation(async (id: string | null) => ({ id: id ?? 'loja-fallback', gc_loja_id: `gc-${id ?? 'fallback'}` }));
    mocks.buscarTecidoGc.mockResolvedValue({ id: 'tecido-1', nome: 'Tecido Teste', dimensao_m: 2, preco_venda: 100, preco_custo: 50 });
    mocks.mapasDePrecoComponentes.mockResolvedValue({ precos: new Map(), custos: new Map() });
    mocks.precoPersianaItem.mockReturnValue({
      tc: 0.75,
      valor: 120,
      valor_custo: 60,
      venda: { tecido: { quantidade: 1.2 } },
    });
    mocks.componentesSnapshot.mockReturnValue([]);
    mocks.indiceInstalacoes.mockResolvedValue(new Map());
    mocks.encontrarCalculadora.mockReturnValue(null);
  });

  it('salva na loja enviada por admin', async () => {
    const res = makeRes();

    await criarOrcamento(makeReq('admin', 'loja-admin-padrao', 'loja-escolhida'), res);

    expect(mocks.resolverLoja).toHaveBeenCalledWith('loja-escolhida');
    expect(mocks.prisma.orcamento.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ loja_id: 'loja-escolhida' }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('ignora loja enviada por vendedor e usa a loja da sessao', async () => {
    const res = makeRes();

    await criarOrcamento(makeReq('vendedor', 'loja-do-vendedor', 'loja-forcada'), res);

    expect(mocks.resolverLoja).toHaveBeenCalledWith('loja-do-vendedor');
    expect(mocks.prisma.orcamento.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ loja_id: 'loja-do-vendedor' }),
    }));
  });
});

describe('duplicarOrcamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.orcamento.create.mockImplementation(async ({ data }) => ({ id: 'orc-copia', ...data }));
    mocks.prisma.logAcao.create.mockResolvedValue({});
  });

  it('cria uma copia em rascunho sem vinculos do GestaoClick', async () => {
    mocks.prisma.orcamento.findUnique.mockResolvedValue({
      id: 'orc-original',
      tipo_produto: 'cortina',
      usuario_id: 'admin-1',
      loja_id: 'loja-1',
      gc_orcamento_id: 'gc-orc-1',
      gc_codigo: '847',
      gc_produto_id: 'gc-prod-1',
      status: 'enviado',
      nome_cliente: 'Cliente Teste',
      gc_cliente_id: 'cliente-gc-1',
      tecido_codigo_gc: 'tecido-1',
      tecido_nome: 'Tecido Teste',
      largura_m: 1,
      altura_m: 2,
      dimensao_m: null,
      tc_m: null,
      acionamento: null,
      cor_acessorio: null,
      rolamento: null,
      valor_bruto: 100,
      valor_final: 100,
      itens_json: { cortinas: [] },
      entrada_json: { cortinas: [] },
      payload_gc_enviado: { enviado: true },
      resposta_gc: { ok: true },
      erro_gc: null,
      criado_em: new Date(),
      atualizado_em: new Date(),
    });
    const req = {
      session: { usuario: { id: 'admin-1', perfil: 'admin', gc_usuario_id: null, loja_id: 'loja-1' } },
      params: { id: 'orc-original' },
    } as unknown as Request;
    const res = makeRes();

    await duplicarOrcamento(req, res);

    expect(mocks.prisma.orcamento.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'rascunho',
        usuario_id: 'admin-1',
        loja_id: 'loja-1',
        gc_orcamento_id: null,
        gc_codigo: null,
        gc_produto_id: null,
        erro_gc: null,
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('duplica orcamento antigo com snapshots json nulos', async () => {
    mocks.prisma.orcamento.findUnique.mockResolvedValue({
      id: 'orc-antigo',
      tipo_produto: 'cortina',
      usuario_id: 'admin-1',
      loja_id: 'loja-1',
      gc_orcamento_id: 'gc-orc-1',
      gc_codigo: '847',
      gc_produto_id: null,
      status: 'enviado',
      nome_cliente: 'Cliente Teste',
      gc_cliente_id: 'cliente-gc-1',
      tecido_codigo_gc: 'tecido-1',
      tecido_nome: 'Tecido Teste',
      largura_m: 1,
      altura_m: 2,
      dimensao_m: null,
      tc_m: null,
      acionamento: null,
      cor_acessorio: null,
      rolamento: null,
      valor_bruto: 100,
      valor_final: 100,
      itens_json: null,
      entrada_json: null,
      payload_gc_enviado: null,
      resposta_gc: null,
      erro_gc: null,
      criado_em: new Date(),
      atualizado_em: new Date(),
    });
    const req = {
      session: { usuario: { id: 'admin-1', perfil: 'admin', gc_usuario_id: null, loja_id: 'loja-1' } },
      params: { id: 'orc-antigo' },
    } as unknown as Request;
    const res = makeRes();

    await duplicarOrcamento(req, res);

    expect(mocks.prisma.orcamento.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'rascunho',
        itens_json: expect.any(Object),
        entrada_json: expect.any(Object),
        payload_gc_enviado: expect.any(Object),
        resposta_gc: expect.any(Object),
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
