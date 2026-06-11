// apps/api/src/services/calc/cortina.ts
// BLOQUEANTE-02: regras de cálculo de cortina não mapeadas (levantamento com
// vendedoras pendente). NÃO implementar além deste stub (SRD §RN-09, Fase 7).

export class NotImplementedError extends Error {
  code = 'CORTINA_NAO_IMPLEMENTADA';
  constructor() {
    super(
      'Cálculo de cortina não implementado (BLOQUEANTE-02). Disponível após levantamento de regras com as vendedoras.',
    );
    this.name = 'NotImplementedError';
  }
}

export function calcularCortina(): never {
  throw new NotImplementedError();
}
