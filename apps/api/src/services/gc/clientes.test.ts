import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarCliente } from './clientes';
import { gcRequest } from './client';

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
  gcRequest: vi.fn().mockResolvedValue({ data: { id: 'cliente-gc-1', nome: 'Fulano', tipo_pessoa: 'PF' } }),
}));

describe('criarCliente', () => {
  beforeEach(() => {
    vi.mocked(gcRequest).mockReset();
    vi.mocked(gcRequest).mockResolvedValue({ data: { id: 'cliente-gc-1', nome: 'Fulano', tipo_pessoa: 'PF' } });
  });

  it('envia payload PF com cpf e sem campos de PJ', async () => {
    await criarCliente({ tipo_pessoa: 'PF', nome: 'Fulano de Tal', cpf: '123.456.789-00', telefone: '1122223333' });

    expect(gcRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/clientes',
      data: expect.objectContaining({
        tipo_pessoa: 'PF',
        nome: 'Fulano de Tal',
        cpf: '123.456.789-00',
        telefone: '1122223333',
      }),
    }));
    const data = vi.mocked(gcRequest).mock.calls[0][0].data;
    expect(data.cnpj).toBeUndefined();
    expect(data.razao_social).toBeUndefined();
  });

  it('envia payload PJ com cnpj e razao_social, sem cpf', async () => {
    await criarCliente({ tipo_pessoa: 'PJ', nome: 'Loja Fulano', razao_social: 'Fulano Comercio LTDA', cnpj: '12.345.678/0001-00' });

    const data = vi.mocked(gcRequest).mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      tipo_pessoa: 'PJ',
      nome: 'Loja Fulano',
      razao_social: 'Fulano Comercio LTDA',
      cnpj: '12.345.678/0001-00',
    }));
    expect(data.cpf).toBeUndefined();
  });

  it('nao inclui campos opcionais vazios no payload', async () => {
    await criarCliente({ tipo_pessoa: 'PF', nome: 'Fulano' });

    const data = vi.mocked(gcRequest).mock.calls[0][0].data;
    expect(data.telefone).toBeUndefined();
    expect(data.celular).toBeUndefined();
    expect(data.email).toBeUndefined();
    expect(data.cpf).toBeUndefined();
    expect(data.enderecos).toBeUndefined();
  });

  it('monta o array de enderecos quando algum campo de endereco e informado', async () => {
    await criarCliente({
      tipo_pessoa: 'PF',
      nome: 'Fulano',
      endereco: { cep: '01000-000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'São Paulo', estado: 'SP' },
    });

    const data = vi.mocked(gcRequest).mock.calls[0][0].data;
    expect(data.enderecos).toEqual([{
      endereco: {
        cep: '01000-000',
        logradouro: 'Rua A',
        numero: '10',
        complemento: '',
        bairro: 'Centro',
        cidade: 'São Paulo',
        estado: 'SP',
      },
    }]);
  });

  it('retorna o cliente resumido a partir da resposta do GC', async () => {
    vi.mocked(gcRequest).mockResolvedValue({ data: { id: '999', nome: 'Loja Fulano', tipo_pessoa: 'PJ', cnpj: '12.345.678/0001-00' } });

    const cliente = await criarCliente({ tipo_pessoa: 'PJ', nome: 'Loja Fulano', cnpj: '12.345.678/0001-00' });

    expect(cliente).toEqual({ id: '999', nome: 'Loja Fulano', tipo_pessoa: 'PJ', documento: '12.345.678/0001-00' });
  });

  it('lanca erro quando o GC nao retorna id', async () => {
    vi.mocked(gcRequest).mockResolvedValue({ data: {} });

    await expect(criarCliente({ tipo_pessoa: 'PF', nome: 'Fulano' })).rejects.toThrow('GestãoClick não retornou o id do cliente.');
  });
});
