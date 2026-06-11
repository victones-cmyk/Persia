import { describe, it, expect } from 'vitest';
import { calcularCortina, NotImplementedError } from './cortina';

describe('Cortina (BLOQUEANTE-02)', () => {
  it('lança NotImplementedError', () => {
    expect(() => calcularCortina()).toThrow(NotImplementedError);
    try {
      calcularCortina();
    } catch (e) {
      expect((e as NotImplementedError).code).toBe('CORTINA_NAO_IMPLEMENTADA');
    }
  });
});
