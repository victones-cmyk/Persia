import { describe, it, expect } from 'vitest';
import { TIPOS_PERSIANA, isTipoPersiana, META, TC_FATOR } from './tipos';

describe('tipos', () => {
  it('TIPOS_PERSIANA tem os 7 tipos', () => {
    expect(TIPOS_PERSIANA).toHaveLength(7);
    expect(TIPOS_PERSIANA).toContain('persiana_rolo_blackout');
  });

  it('isTipoPersiana valida', () => {
    expect(isTipoPersiana('persiana_rolo_blackout')).toBe(true);
    expect(isTipoPersiana('cortina')).toBe(false);
    expect(isTipoPersiana('qualquer')).toBe(false);
  });

  it('META cobre todos os códigos GC e TC_FATOR=0.7', () => {
    expect(META.persiana_rolo_blackout.codigoGc).toBe('2591');
    expect(TC_FATOR).toBe(0.7);
  });
});
