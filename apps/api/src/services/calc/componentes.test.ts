import { describe, it, expect } from 'vitest';
import {
  componentesFixos,
  componentesCondicionais,
  baseTampa,
} from './componentes';
import { roundHalfUp } from './arredondamento';

describe('RN-05 — Componentes fixos', () => {
  it('rolo: fita desconta margem, mão de obra "PERSIANA"', () => {
    const c = componentesFixos('persiana_rolo_blackout', 1.5);
    const dupla = c.find((x) => x.descricao === 'FITA DUPLA FACE')!;
    const colante = c.find((x) => x.descricao === 'FITA COLANTE 15MM')!;
    expect(dupla.quantidade).toBe(roundHalfUp(1.5 - 0.02, 4)); // 1.48
    expect(colante.quantidade).toBe(roundHalfUp(1.5 - 0.03, 4)); // 1.47
    expect(c.some((x) => x.descricao === 'MÃO DE OBRA PERSIANA')).toBe(true);
    const paraf = c.find((x) => x.descricao === 'PARAFUSO E BUCHA PARA PERSIANA')!;
    expect(paraf.quantidade).toBe(3); // 1.5/0.5
    expect(c.find((x) => x.descricao === 'EMBALAGEM DE PERSIANA')!.quantidade).toBe(1);
  });

  it('romana: fita usa largura cheia, mão de obra "ROMANA"', () => {
    const c = componentesFixos('persiana_romana_blackout', 1.5);
    expect(c.find((x) => x.descricao === 'FITA DUPLA FACE')!.quantidade).toBe(1.5);
    expect(c.some((x) => x.descricao === 'MÃO DE OBRA PERSIANA ROMANA')).toBe(true);
  });

  it('rolo translúcido (2608) usa mão de obra romana', () => {
    const c = componentesFixos('persiana_rolo_translucido', 1.5);
    expect(c.some((x) => x.descricao === 'MÃO DE OBRA PERSIANA ROMANA')).toBe(true);
  });
});

describe('RN-07 — Base e Tampa', () => {
  it('rolo: BASE CONICA com [Largura]-0.025 e 2 tampas', () => {
    const c = baseTampa('persiana_rolo_blackout', 'Branco', 1.5);
    const b = c.find((x) => x.descricao === 'BASE CONICA COR BRANCO')!;
    const t = c.find((x) => x.descricao === 'TAMPA DA BASE CONICA COR BRANCO')!;
    expect(b.quantidade).toBe(roundHalfUp(1.5 - 0.025, 4)); // 1.475
    expect(t.quantidade).toBe(2);
  });

  it('romana: base usa [Largura] (sem -0.025)', () => {
    const c = baseTampa('persiana_romana_blackout', 'Cinza', 1.5);
    expect(c.find((x) => x.descricao === 'BASE CONICA COR CINZA')!.quantidade).toBe(1.5);
  });

  it('Double Vision usa componentes BASE DOUBLE VISION', () => {
    const c = baseTampa('persiana_rolo_double_vision', 'Preto', 1.5);
    expect(c.some((x) => x.descricao === 'BASE DOUBLE VISION COR PRETO')).toBe(true);
    expect(c.some((x) => x.descricao === 'TAMPA DA BASE DOUBLE VISION COR PRETO')).toBe(true);
    expect(c.some((x) => x.descricao.includes('CONICA'))).toBe(false);
  });
});

describe('RN-06 — Componentes condicionais', () => {
  it('filtra por cor', () => {
    const branco = componentesCondicionais('persiana_rolo_blackout', 'Branco', 'com_bando', 1.5, 2);
    expect(branco.some((x) => x.descricao === 'PRESILHA 50MM BRANCA')).toBe(true);

    const preto = componentesCondicionais('persiana_rolo_blackout', 'Preto', 'com_bando', 1.5, 2);
    expect(preto.some((x) => x.descricao === 'PRESILHA 50MM BRANCA')).toBe(false);
  });

  it('filtra por acionamento', () => {
    const semBando = componentesCondicionais(
      'persiana_rolo_blackout',
      'Branco',
      'motorizado_sem_bando',
      1.5,
      2,
    );
    expect(semBando.some((x) => x.descricao === 'PRESILHA 50MM BRANCA')).toBe(false);
  });

  it('filtra por faixa de largura (comparador)', () => {
    const dentro = componentesCondicionais('persiana_rolo_blackout', 'Branco', 'com_bando', 1.5, 2);
    const fora = componentesCondicionais('persiana_rolo_blackout', 'Branco', 'com_bando', 0.005, 2);
    expect(dentro.some((x) => x.descricao === 'PRESILHA 50MM BRANCA')).toBe(true);
    expect(fora.some((x) => x.descricao === 'PRESILHA 50MM BRANCA')).toBe(false);
  });

  it('quantidade calculada pela fórmula', () => {
    const c = componentesCondicionais('persiana_rolo_blackout', 'Branco', 'com_bando', 1.5, 2);
    const presilha = c.find((x) => x.descricao === 'PRESILHA 50MM BRANCA')!;
    expect(presilha.quantidade).toBe(roundHalfUp(1.5 / 0.5, 4)); // 3
  });
});
