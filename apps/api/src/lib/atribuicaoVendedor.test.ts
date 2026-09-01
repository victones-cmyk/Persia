import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { usuario: { findUnique: vi.fn() } },
}));
vi.mock('./prisma', () => ({ prisma: mocks.prisma }));

import { resolverVendedorAtribuido } from './atribuicaoVendedor';

const VENDEDOR_ATIVO = { id: 'v1', nome: 'Vendedor Um', perfil: 'vendedor', ativo: true, gc_usuario_id: 'gc-v1' };

describe('resolverVendedorAtribuido', () => {
  beforeEach(() => {
    mocks.prisma.usuario.findUnique.mockReset();
  });

  it('ignora vendedor_id quando quem pede não é admin — sem nem consultar o banco', async () => {
    const r = await resolverVendedorAtribuido({ perfil: 'vendedor' }, 'v1');
    expect(r).toBeNull();
    expect(mocks.prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('revenda também não pode atribuir, mesmo mandando um vendedor_id válido', async () => {
    const r = await resolverVendedorAtribuido({ perfil: 'revenda' }, 'v1');
    expect(r).toBeNull();
    expect(mocks.prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('admin sem vendedor_id (campo vazio/ausente) → null, sem erro', async () => {
    expect(await resolverVendedorAtribuido({ perfil: 'admin' }, undefined)).toBeNull();
    expect(await resolverVendedorAtribuido({ perfil: 'admin' }, '')).toBeNull();
    expect(await resolverVendedorAtribuido({ perfil: 'admin' }, '   ')).toBeNull();
    expect(mocks.prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('admin com vendedor_id válido → resolve id/nome/gc_usuario_id', async () => {
    mocks.prisma.usuario.findUnique.mockResolvedValue(VENDEDOR_ATIVO);
    const r = await resolverVendedorAtribuido({ perfil: 'admin' }, 'v1');
    expect(r).toEqual({ id: 'v1', nome: 'Vendedor Um', gc_usuario_id: 'gc-v1' });
  });

  it('rejeita vendedor_id de um usuário inativo', async () => {
    mocks.prisma.usuario.findUnique.mockResolvedValue({ ...VENDEDOR_ATIVO, ativo: false });
    await expect(resolverVendedorAtribuido({ perfil: 'admin' }, 'v1')).rejects.toMatchObject({ code: 'VENDEDOR_INVALIDO' });
  });

  it('rejeita vendedor_id de um perfil que não é vendedor (ex.: outro admin ou revenda)', async () => {
    mocks.prisma.usuario.findUnique.mockResolvedValue({ ...VENDEDOR_ATIVO, perfil: 'admin' });
    await expect(resolverVendedorAtribuido({ perfil: 'admin' }, 'v1')).rejects.toMatchObject({ code: 'VENDEDOR_INVALIDO' });
  });

  it('rejeita um id que não existe', async () => {
    mocks.prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(resolverVendedorAtribuido({ perfil: 'admin' }, 'nao-existe')).rejects.toMatchObject({ code: 'VENDEDOR_INVALIDO' });
  });
});
