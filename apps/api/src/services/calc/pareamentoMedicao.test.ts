import { describe, it, expect } from 'vitest';
import { sugerirPareamento, normalizarPareamento, pecasSemPareamento } from './pareamentoMedicao';

// O caso real que motivou tudo: pedido 76127, Edna Maria. A vendedora escreveu
// "SALA" nas três cortinas; o técnico achou três vãos e nomeou cada um do seu
// jeito, dois deles diferindo só na caixa.
const ambientesReais = [
  { id: '673c1d93', nome: 'SALA ( sanca 15 cm )' },
  { id: '515b0ca4', nome: 'Sala ( sanca 15 cm )' },
  { id: 'b1cc533d', nome: 'Sala Jantar ( sanca 15cm )' },
];
const pecasReais = [
  { index: 0, ambiente: 'SALA' },
  { index: 1, ambiente: 'SALA' },
  { index: 2, ambiente: 'SALA' },
];

describe('sugerirPareamento', () => {
  it('acha as peças cujo nome está contido no nome do ambiente medido', () => {
    const s = sugerirPareamento(ambientesReais, pecasReais);
    // "SALA" cabe dentro de "SALA ( sanca 15 cm )" — o palpite liga alguma coisa
    // em vez de abrir a tela vazia.
    expect(Object.keys(s).length).toBeGreaterThan(0);
  });

  it('nunca dá a mesma peça a dois ambientes', () => {
    const s = sugerirPareamento(ambientesReais, pecasReais);
    const todas = Object.values(s).flat();
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('nome exato tem prioridade sobre nome contido', () => {
    // Sem a prioridade, "Sala" abocanharia a peça de "Sala Jantar".
    const s = sugerirPareamento(
      [{ id: 'a', nome: 'Sala' }, { id: 'b', nome: 'Sala Jantar' }],
      [{ index: 0, ambiente: 'Sala Jantar' }, { index: 1, ambiente: 'Sala' }],
    );
    expect(s['b']).toEqual([0]);
    expect(s['a']).toEqual([1]);
  });

  it('ambiente sem id fica de fora — o id é a chave do pareamento', () => {
    const s = sugerirPareamento([{ id: null, nome: 'Sala' }], [{ index: 0, ambiente: 'Sala' }]);
    expect(s).toEqual({});
  });

  it('sem nada em comum, não inventa ligação', () => {
    const s = sugerirPareamento([{ id: 'a', nome: 'Varanda' }], [{ index: 0, ambiente: 'Cozinha' }]);
    expect(s).toEqual({});
  });
});

describe('normalizarPareamento', () => {
  const ids = ['a', 'b'];

  it('aceita um pareamento válido', () => {
    expect(normalizarPareamento({ a: [0, 1], b: [2] }, ids, 3)).toEqual({ a: [0, 1], b: [2] });
  });

  it('descarta ambiente que não existe', () => {
    expect(normalizarPareamento({ z: [0] }, ids, 3)).toEqual({});
  });

  it('descarta índice fora da lista', () => {
    expect(normalizarPareamento({ a: [0, 99, -1] }, ids, 3)).toEqual({ a: [0] });
  });

  it('a mesma peça não pode pertencer a dois ambientes', () => {
    // Seria contada duas vezes na comparação e recalculada duas vezes, com
    // medidas diferentes.
    const r = normalizarPareamento({ a: [0, 1], b: [1, 2] }, ids, 3);
    expect(r.a).toEqual([0, 1]);
    expect(r.b).toEqual([2]);
  });

  it('remove repetição dentro do mesmo ambiente', () => {
    expect(normalizarPareamento({ a: [1, 1, 1] }, ids, 3)).toEqual({ a: [1] });
  });

  it('entrada inválida vira pareamento vazio, não exceção', () => {
    expect(normalizarPareamento(null, ids, 3)).toEqual({});
    expect(normalizarPareamento('x', ids, 3)).toEqual({});
    expect(normalizarPareamento({ a: 'nao-array' }, ids, 3)).toEqual({});
  });
});

describe('pecasSemPareamento', () => {
  it('aponta o que ficou sem ambiente', () => {
    expect(pecasSemPareamento({ a: [0, 2] }, 4)).toEqual([1, 3]);
  });

  it('tudo pareado não sobra nada', () => {
    expect(pecasSemPareamento({ a: [0, 1] }, 2)).toEqual([]);
  });

  it('pareamento vazio deixa tudo sobrando', () => {
    expect(pecasSemPareamento({}, 3)).toEqual([0, 1, 2]);
  });
});

describe('sugestão reparte em vez de o primeiro levar tudo', () => {
  it('três vãos e três peças de mesmo nome viram 1:1', () => {
    // Caso real (pedido 76127): as três peças se chamam "SALA" e "SALA" cabe no
    // nome dos três vãos. Sem repartir, o primeiro levava as três e os outros
    // dois ficavam órfãos — palpite pior que nenhum.
    const s = sugerirPareamento(ambientesReais, pecasReais);
    expect(Object.keys(s)).toHaveLength(3);
    expect(Object.values(s).every((l) => l.length === 1)).toBe(true);
    expect(Object.values(s).flat().sort()).toEqual([0, 1, 2]);
  });

  it('um vão só continua levando todas as folhas (sacada)', () => {
    const s = sugerirPareamento(
      [{ id: 'x', nome: 'Sacada' }],
      [0, 1, 2, 3, 4].map((index) => ({ index, ambiente: 'Sacada' })),
    );
    expect(s['x']).toEqual([0, 1, 2, 3, 4]);
  });
});
