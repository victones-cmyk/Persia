// apps/api/src/lib/atribuicaoVendedor.ts
// Admin pode montar um orçamento em nome de um vendedor: ele passa a "pertencer"
// a esse vendedor (usuario_id do orçamento e vendedor no GestãoClick), aparecendo
// na listagem dele — sem isso, todo orçamento feito pelo admin ficava só com o
// próprio admin (Victor, 01/09/2026). Função ÚNICA usada pelos 3 controllers de
// criação (persiana/cortina/misto) para não divergir entre eles.

import type { Usuario } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { prisma } from './prisma';

export interface VendedorAtribuido {
  id: string;
  nome: string;
  gc_usuario_id: string | null;
}

function paraVendedorAtribuido(u: Usuario): VendedorAtribuido {
  return { id: u.id, nome: u.nome, gc_usuario_id: u.gc_usuario_id };
}

/**
 * Resolve o vendedor indicado no corpo da requisição (`vendedor_id`). Só o
 * perfil admin pode atribuir — qualquer outro perfil que mande o campo é
 * ignorado (sem erro; evita quebrar um payload que não devia ter o campo).
 * Lança 400 se o id não corresponder a um vendedor ativo.
 */
export async function resolverVendedorAtribuido(
  sessao: { perfil: string },
  vendedorIdBruto: unknown,
): Promise<VendedorAtribuido | null> {
  if (sessao.perfil !== 'admin') return null;
  const vendedorId = typeof vendedorIdBruto === 'string' ? vendedorIdBruto.trim() : '';
  if (!vendedorId) return null;
  const vendedor = await prisma.usuario.findUnique({ where: { id: vendedorId } });
  if (!vendedor || !vendedor.ativo || vendedor.perfil !== 'vendedor') {
    throw new AppError(400, 'VENDEDOR_INVALIDO', 'Selecione um vendedor válido.');
  }
  return paraVendedorAtribuido(vendedor);
}
