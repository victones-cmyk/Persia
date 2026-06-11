import { describe, it, expect } from 'vitest';
import { roundHalfUp } from './arredondamento';

describe('roundHalfUp (SRD §10)', () => {
  it('arredonda 0,5 para cima', () => {
    expect(roundHalfUp(1.225)).toBe(1.23);
    expect(roundHalfUp(2.5, 0)).toBe(3);
  });

  it('mantém abaixo de 0,5', () => {
    expect(roundHalfUp(1.224)).toBe(1.22);
  });

  it('respeita o número de casas decimais', () => {
    expect(roundHalfUp(1.23456, 4)).toBe(1.2346);
    expect(roundHalfUp(1.5, 0)).toBe(2);
  });

  it('preserva valores já arredondados', () => {
    expect(roundHalfUp(4.3)).toBe(4.3);
    expect(roundHalfUp(0)).toBe(0);
  });
});
