import { describe, it, expect } from 'vitest';
import { agoraSaoPaulo, HORA_LIMITE } from './agendadorBaixaEstoque';

/**
 * O relógio do servidor é UTC. Se a conversão para São Paulo estiver errada, a
 * rotina roda no horário errado — em pleno expediente, que é exatamente o que
 * ela existe para evitar. São Paulo é UTC-3 (sem horário de verão desde 2019).
 */
describe('agoraSaoPaulo', () => {
  it('converte meia-noite de São Paulo (03:00 UTC)', () => {
    const r = agoraSaoPaulo(new Date('2026-09-08T03:00:00Z'));
    expect(r).toEqual({ data: '2026-09-08', hora: 0 });
  });

  it('vira o dia às 03:00 UTC, não às 00:00 UTC', () => {
    // 02:59 UTC ainda é dia 7 em São Paulo (23:59).
    expect(agoraSaoPaulo(new Date('2026-09-08T02:59:00Z'))).toEqual({ data: '2026-09-07', hora: 23 });
    expect(agoraSaoPaulo(new Date('2026-09-08T03:00:00Z')).data).toBe('2026-09-08');
  });

  it('meio-dia UTC é manhã em São Paulo', () => {
    expect(agoraSaoPaulo(new Date('2026-09-08T12:00:00Z'))).toEqual({ data: '2026-09-08', hora: 9 });
  });

  it('a janela de execução cobre a madrugada inteira e nada do expediente', () => {
    const dentro = (iso: string) => agoraSaoPaulo(new Date(iso)).hora < HORA_LIMITE;
    expect(dentro('2026-09-08T03:05:00Z')).toBe(true);  // 00:05 SP
    expect(dentro('2026-09-08T06:00:00Z')).toBe(true);  // 03:00 SP
    expect(dentro('2026-09-08T07:59:00Z')).toBe(true);  // 04:59 SP
    expect(dentro('2026-09-08T08:00:00Z')).toBe(false); // 05:00 SP — fecha
    expect(dentro('2026-09-08T12:00:00Z')).toBe(false); // 09:00 SP, loja aberta
    expect(dentro('2026-09-08T21:00:00Z')).toBe(false); // 18:00 SP
  });

  it('hora vem como número de 0 a 23, sem AM/PM', () => {
    for (const h of [0, 6, 12, 18, 23]) {
      const utc = new Date(Date.UTC(2026, 8, 8, (h + 3) % 24));
      expect(agoraSaoPaulo(utc).hora).toBe(h);
    }
  });
});
