// apps/api/src/lib/permissaoRevenda.ts
// Regras de acesso do perfil revenda: só pode montar orçamento com as calculadoras
// que o admin liberou (padrão: nenhuma) e só em nome do cliente do GestãoClick ao
// qual está atrelada (nunca escolhe outro cliente). admin/vendedor não são afetados.

import { AppError } from '../middleware/errorHandler';

export const SECOES_CALCULADORA = ['persiana', 'cortina', 'trilho', 'avulso'] as const;
export type SecaoCalculadora = (typeof SECOES_CALCULADORA)[number];

interface SessaoRevenda {
  perfil: string;
  calculadoras_permitidas?: string[] | null;
  gc_cliente_vinculado_id?: string | null;
}

/** Lança 403 se a revenda não tiver a calculadora liberada. admin/vendedor: sem restrição. */
export function verificarAcessoCalculadora(sessao: SessaoRevenda, secao: SecaoCalculadora): void {
  if (sessao.perfil !== 'revenda') return;
  if (!(sessao.calculadoras_permitidas ?? []).includes(secao)) {
    throw new AppError(403, 'CALCULADORA_NAO_PERMITIDA', `Sua revenda não tem acesso à calculadora de ${secao}.`);
  }
}

/**
 * Cliente da revenda: sempre o vinculado na sessão (nunca o do corpo da requisição —
 * evita que uma revenda envie orçamento em nome de outro cliente do GestãoClick).
 */
export function clienteGcDaRevenda(sessao: SessaoRevenda): string {
  if (!sessao.gc_cliente_vinculado_id) {
    throw new AppError(400, 'SEM_CLIENTE_VINCULADO', 'Sua revenda ainda não tem um cliente do GestãoClick vinculado. Contate o administrador.');
  }
  return sessao.gc_cliente_vinculado_id;
}
