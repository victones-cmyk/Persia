// apps/api/src/lib/validarPedido.ts
// Validação de data de entrega do pedido — compartilhada entre orcamentoController
// (gerarVendaOrcamento, caminho único e protegido de confirmação de pedido) e
// producaoController (medição/OS, que também lida com data de entrega).

import { AppError } from '../middleware/errorHandler';

export function validarDataEntrega(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new AppError(400, 'DATA_ENTREGA_INVALIDA', 'Informe a data de entrega no formato AAAA-MM-DD.');
  }
  const [ano, mes, dia] = v.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    throw new AppError(400, 'DATA_ENTREGA_INVALIDA', 'Informe uma data de entrega válida.');
  }
  return data;
}
