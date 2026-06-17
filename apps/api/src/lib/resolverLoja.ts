// apps/api/src/lib/resolverLoja.ts
// Resolve a loja interna (+ gc_loja_id) do usuário; fallback na 1ª loja (matriz).
// Compartilhado entre os controllers de orçamento (persiana e cortina).

import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';

export async function resolverLoja(lojaIdUsuario: string | null) {
  if (lojaIdUsuario) {
    const loja = await prisma.loja.findUnique({ where: { id: lojaIdUsuario } });
    if (loja) return loja;
  }
  const matriz = await prisma.loja.findFirst({ orderBy: { nome: 'asc' } });
  if (!matriz) throw new AppError(500, 'SEM_LOJA', 'Nenhuma loja cadastrada.');
  return matriz;
}
