import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarProduto, nomeProdutoGc, urlProdutoUnica } from './produtos';
import { GcError, gcRequest } from './client';

vi.mock('./client', () => ({
  GcError: class GcError extends Error {
    constructor(
      public status: number,
      message: string,
      public payload?: unknown,
    ) {
      super(message);
      this.name = 'GcError';
    }
  },
  gcRequest: vi.fn().mockResolvedValue({ data: { id: 'produto-gc-1' } }),
}));

describe('payload de produto sintetico', () => {
  beforeEach(() => {
    vi.mocked(gcRequest).mockReset();
    vi.mocked(gcRequest).mockResolvedValue({ data: { id: 'produto-gc-1' } });
  });

  it('mantem o nome limpo sem codigo interno', () => {
    const nome = nomeProdutoGc('Sala, Cortina Wave TEX-101 2,00X2,50');

    expect(nome).toBe('Sala, Cortina Wave TEX-101 2,00X2,50');
    expect(nome).not.toContain('PERSIA-');
  });

  it('trunca nomes longos no limite do GestaoClick', () => {
    const nome = nomeProdutoGc('X'.repeat(180));

    expect(nome.length).toBeLessThanOrEqual(120);
  });

  it('gera url tecnica unica a partir do codigo interno', () => {
    expect(urlProdutoUnica('1783190400000001')).toBe('1783190400000001');
  });

  it('envia codigo interno numerico unico sem alterar o nome', async () => {
    await criarProduto({
      nome: 'Sala, Cortina Wave TEX-101 2,00X2,50',
      descricao: 'Fixação: Trilho\nAbertura: Sem abertura',
      valor_custo: 100,
      valor_venda: 500,
    });

    expect(gcRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/produtos',
      data: expect.objectContaining({
        nome: 'Sala, Cortina Wave TEX-101 2,00X2,50',
        descricao: 'Fixação: Trilho\nAbertura: Sem abertura',
        codigo_interno: expect.stringMatching(/^\d+$/),
        url: expect.stringMatching(/^\d+$/),
      }),
    }));
  });

  it('reutiliza produto existente quando o GestaoClick acusa URL duplicada', async () => {
    vi.mocked(gcRequest)
      .mockRejectedValueOnce(new GcError(404, 'POST /api/produtos: A URL do produto já está sendo utilizada!'))
      .mockResolvedValueOnce({ data: [{ id: 'produto-existente-1', nome: 'Sala, Cortina Wave TEX-101 2,00X2,50' }] });

    const produto = await criarProduto({ nome: 'Sala, Cortina Wave TEX-101 2,00X2,50', valor_custo: 100, valor_venda: 500 });

    expect(produto).toEqual(expect.objectContaining({
      gc_produto_id: 'produto-existente-1',
      criado: false,
    }));
    expect(gcRequest).toHaveBeenLastCalledWith(expect.objectContaining({
      method: 'GET',
      url: '/api/produtos',
      params: expect.objectContaining({ nome: 'Sala, Cortina Wave TEX-101 2,00X2,50', ativo: 1 }),
    }));
  });
});
