import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../../lib/prisma', () => ({
  prisma: { gcProdutoLocal: { findMany: mocks.findMany } },
}));

import { invalidarCacheCatalogoLocal, listarProdutosLocais, sincronizacaoDiariaPendente } from './catalogoLocal';

beforeEach(() => {
  mocks.findMany.mockReset();
  invalidarCacheCatalogoLocal();
});

describe('listarProdutosLocais', () => {
  it('carrega o catálogo uma vez e reutiliza o índice para grupos diferentes', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: '1', nome: 'Tecido', codigo_interno: 'T1', ativo: true, grupo_id: 'FILHO', nome_grupo: 'Filho',
        largura: '2.80', valor_venda: { toString: () => '100' }, valores: [], atributos: [],
        raw_json: { __catalogo_grupo_ids: ['PAI'] },
      },
      {
        id: '2', nome: 'Inativo', codigo_interno: 'I1', ativo: false, grupo_id: 'PAI', nome_grupo: 'Pai',
        largura: null, valor_venda: { toString: () => '10' }, valores: [], atributos: [], raw_json: {},
      },
    ]);

    const peloPai = await listarProdutosLocais({ grupo_id: 'PAI', ativo: 1 });
    const peloFilho = await listarProdutosLocais({ grupo_id: 'FILHO', ativo: 1 });

    expect(peloPai?.map((p) => p.id)).toEqual(['1']);
    expect(peloFilho?.map((p) => p.id)).toEqual(['1']);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
  });

  it('tenta de novo em vez de aceitar dados obsoletos quando uma sincronização invalida durante a própria leitura em voo', async () => {
    let resolverLeituraLenta!: (v: unknown[]) => void;
    const leituraLenta = new Promise<unknown[]>((resolve) => { resolverLeituraLenta = resolve; });
    mocks.findMany.mockReturnValueOnce(leituraLenta);
    mocks.findMany.mockResolvedValueOnce([
      { id: '2', nome: 'Novo', codigo_interno: 'N1', ativo: true, grupo_id: '', nome_grupo: '', largura: null, valor_venda: { toString: () => '20' }, valores: [], atributos: [], raw_json: {} },
    ]);

    const promessa = listarProdutosLocais({ ativo: 1 });

    // Uma sincronização termina e invalida o cache enquanto a leitura acima ainda está em voo.
    invalidarCacheCatalogoLocal();

    resolverLeituraLenta([
      { id: '1', nome: 'Antigo', codigo_interno: 'A1', ativo: true, grupo_id: '', nome_grupo: '', largura: null, valor_venda: { toString: () => '10' }, valores: [], atributos: [], raw_json: {} },
    ]);

    const resultado = await promessa;

    expect(resultado?.map((p) => p.id)).toEqual(['2']);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
  });

  it('não entrega dados obsoletos para quem se junta à leitura em voo antes de uma invalidação', async () => {
    let resolverLeituraLenta!: (v: unknown[]) => void;
    const leituraLenta = new Promise<unknown[]>((resolve) => { resolverLeituraLenta = resolve; });
    mocks.findMany.mockReturnValueOnce(leituraLenta);
    mocks.findMany.mockResolvedValueOnce([
      { id: '2', nome: 'Novo', codigo_interno: 'N1', ativo: true, grupo_id: '', nome_grupo: '', largura: null, valor_venda: { toString: () => '20' }, valores: [], atributos: [], raw_json: {} },
    ]);

    const promessaA = listarProdutosLocais({ ativo: 1 }); // inicia a leitura lenta
    const promessaB = listarProdutosLocais({ ativo: 1 }); // se junta à mesma leitura em voo

    // Uma sincronização termina enquanto A e B ainda aguardam a MESMA leitura em voo.
    invalidarCacheCatalogoLocal();

    resolverLeituraLenta([
      { id: '1', nome: 'Antigo', codigo_interno: 'A1', ativo: true, grupo_id: '', nome_grupo: '', largura: null, valor_venda: { toString: () => '10' }, valores: [], atributos: [], raw_json: {} },
    ]);

    const [resultadoA, resultadoB] = await Promise.all([promessaA, promessaB]);

    expect(resultadoA?.map((p) => p.id)).toEqual(['2']);
    expect(resultadoB?.map((p) => p.id)).toEqual(['2']);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
  });

  it('propaga o erro e libera o estado quando a leitura falha, permitindo tentar de novo depois', async () => {
    mocks.findMany.mockRejectedValueOnce(new Error('conexão falhou'));

    await expect(listarProdutosLocais({ ativo: 1 })).rejects.toThrow('conexão falhou');

    mocks.findMany.mockResolvedValueOnce([
      { id: '3', nome: 'Recuperado', codigo_interno: 'R1', ativo: true, grupo_id: '', nome_grupo: '', largura: null, valor_venda: { toString: () => '30' }, valores: [], atributos: [], raw_json: {} },
    ]);
    const resultado = await listarProdutosLocais({ ativo: 1 });

    expect(resultado?.map((p) => p.id)).toEqual(['3']);
  });
});

describe('sincronizacaoDiariaPendente', () => {
  it('não repete a sincronização automática no mesmo dia em São Paulo', () => {
    const tardeEmSaoPaulo = new Date('2026-07-18T18:00:00.000Z');
    expect(sincronizacaoDiariaPendente('2026-07-18', tardeEmSaoPaulo)).toBe(false);
  });

  it('recupera a sincronização pendente mesmo depois da janela da meia-noite', () => {
    const tardeEmSaoPaulo = new Date('2026-07-18T18:00:00.000Z');
    expect(sincronizacaoDiariaPendente('2026-07-17', tardeEmSaoPaulo)).toBe(true);
  });

  it('respeita a virada do dia no fuso de São Paulo', () => {
    const antesDaMeiaNoite = new Date('2026-07-18T02:59:59.000Z');
    const meiaNoite = new Date('2026-07-18T03:00:00.000Z');

    expect(sincronizacaoDiariaPendente('2026-07-17', antesDaMeiaNoite)).toBe(false);
    expect(sincronizacaoDiariaPendente('2026-07-17', meiaNoite)).toBe(true);
  });
});
