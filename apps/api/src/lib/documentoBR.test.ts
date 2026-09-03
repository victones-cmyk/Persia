import { describe, it, expect } from 'vitest';
import { cpfValido, cnpjValido } from './documentoBR';

describe('cpfValido', () => {
  it('aceita CPF válido, com ou sem máscara', () => {
    expect(cpfValido('123.456.789-09')).toBe(true);
    expect(cpfValido('12345678909')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(cpfValido('123.456.789-00')).toBe(false);
  });

  it('rejeita tamanho errado e sequências repetidas', () => {
    expect(cpfValido('123')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
});

describe('cnpjValido', () => {
  it('aceita CNPJ válido, com ou sem máscara', () => {
    expect(cnpjValido('11.223.333/0001-04')).toBe(true);
    expect(cnpjValido('11223333000104')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(cnpjValido('11.223.333/0001-00')).toBe(false);
  });

  it('rejeita tamanho errado e sequências repetidas', () => {
    expect(cnpjValido('123')).toBe(false);
    expect(cnpjValido('11.111.111/1111-11')).toBe(false);
  });
});
