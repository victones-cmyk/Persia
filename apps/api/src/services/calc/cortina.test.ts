import { describe, it, expect } from 'vitest';
import {
  calcularCortina,
  NotImplementedError,
  type EntradaCortina,
  type ResultadoCortina,
} from './cortina';

// Preços de exemplo da planilha "CORTINA SOB MEDIDA_v.3".
const PRECO: Record<string, number> = {
  Varão: 13,
  Trilho: 13,
  'Varão suíço': 13,
  Suporte: 5,
  'Suporte duplo': 5,
  Ilhoses: 0.3,
  Argolas: 0.3,
  'Rodízios/ganchos': 0.3,
  Ponteira: 5,
  'Entretela (KOS)': 1.5,
  'Tecido (frente)': 50,
  'Tecido (forro)': 20,
  'Tecido (trás)': 20,
};
const SUPORTE_MANUAL = 3;
const INSTALACAO = 140;

function precoDe(item: string): number {
  const base = item.replace(/\s*\(tras[ae]ir[ao]\)$/i, ''); // remove sufixo (traseiro/traseira)
  return PRECO[base] ?? 0;
}
function totalPlanilha(r: ResultadoCortina): number {
  let total = 0;
  for (const it of r.itens) {
    const qtd = it.auto ? it.quantidade : SUPORTE_MANUAL; // suporte é o único manual
    total += qtd * precoDe(it.item);
  }
  return total + INSTALACAO;
}
const qtd = (r: ResultadoCortina, item: string) => r.itens.find((i) => i.item === item)?.quantidade;

const BASE: EntradaCortina = {
  modelo: 'ilhos',
  fixacao: 'varao',
  config: 'um_tecido',
  largura: 3,
  altura: 2.6,
  largura_tecido: 3.0,
  franzido_frente: 3,
  franzido_tras: 2,
  tamanho_barra: 0.1,
  tipo_barra: 'dupla',
  aberturas: 1,
};

describe('Cortina Ilhós (com entretela) — planilha v.3', () => {
  it('um tecido → total R$ 685,50 (672 + entretela 13,50)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'ilhos', config: 'um_tecido' });
    expect(r.metodo).toBe('normal');
    expect(r.barra_consumo).toBe(0.3);
    expect(r.metragem_frente).toBe(9);
    expect(qtd(r, 'Ilhoses')).toBe(60);
    expect(qtd(r, 'Entretela (KOS)')).toBe(9);
    expect(totalPlanilha(r)).toBe(685.5);
  });

  it('forro no mesmo varão → forro acompanha a frente (9 m)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'ilhos', config: 'dois_tecidos_mesmo_varao' });
    expect(qtd(r, 'Tecido (forro)')).toBe(9);
  });

  it('varão duplo → frente ilhós (60) + trás argolas (30) + trás 6 m', () => {
    const r = calcularCortina({ ...BASE, modelo: 'ilhos', config: 'dois_tecidos_varao_duplo' });
    expect(qtd(r, 'Ilhoses')).toBe(60);
    expect(qtd(r, 'Argolas (traseiro)')).toBe(30);
    expect(qtd(r, 'Tecido (trás)')).toBe(6);
  });
});

describe('Cortina Prega (Americana/Macho/Fêmea) — planilha v.3', () => {
  it('um tecido no varão → total R$ 676,50 (ferragem = argolas)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'prega', fixacao: 'varao', config: 'um_tecido' });
    expect(r.barra_consumo).toBe(0.32); // cabeçote 0,12 + barra 0,20
    expect(qtd(r, 'Argolas')).toBe(30);
    expect(qtd(r, 'Entretela (KOS)')).toBe(9);
    expect(totalPlanilha(r)).toBe(676.5);
  });

  it('no trilho → usa rodízios e NÃO usa ponteira', () => {
    const r = calcularCortina({ ...BASE, modelo: 'prega', fixacao: 'trilho', config: 'um_tecido' });
    expect(qtd(r, 'Rodízios/ganchos')).toBe(30);
    expect(qtd(r, 'Ponteira')).toBeUndefined();
  });
});

describe('Cortina Franzido (sem entretela) — planilha v.3', () => {
  it('um tecido → sem entretela, folga 8 cm, total R$ 663', () => {
    const r = calcularCortina({ ...BASE, modelo: 'franzido', fixacao: 'varao', config: 'um_tecido' });
    expect(r.barra_consumo).toBe(0.28); // 0,08 + 0,20
    expect(qtd(r, 'Entretela (KOS)')).toBeUndefined();
    expect(totalPlanilha(r)).toBe(663);
  });
});

describe('Cortina — método de emenda (altura > largura do tecido)', () => {
  it('3,50 × 3,00 em tecido 2,80 → 4 tiras × 3,30 = 13,20 m', () => {
    const r = calcularCortina({
      ...BASE,
      modelo: 'ilhos',
      largura: 3.5,
      altura: 3.0,
      largura_tecido: 2.8,
      franzido_frente: 2.6,
    });
    expect(r.metodo).toBe('emenda');
    expect(r.tiras_frente).toBe(4);
    expect(r.metragem_frente).toBe(13.2);
  });
});

describe('Cortina Wave (fórmula deduzida dos áudios)', () => {
  it('largura 3 m → 64 botões, cordão 3,15 m, tecido/entretela 7,95 m', () => {
    const r = calcularCortina({ ...BASE, modelo: 'wave', fixacao: 'trilho', largura: 3, largura_tecido: 3.0 });
    expect(r.metodo).toBe('normal');
    expect(qtd(r, 'Rodízio wave')).toBe(64);
    expect(qtd(r, 'Base click')).toBe(64);
    expect(qtd(r, 'Cordão wave')).toBe(3.15);
    expect(qtd(r, 'Terminais')).toBe(4);
    expect(r.metragem_frente).toBe(7.95); // = fita wave
    expect(qtd(r, 'Entretela (KOS)')).toBe(7.95);
    expect(qtd(r, 'Ponteira')).toBeUndefined(); // trilho não usa
  });

  it('no varão suíço usa ponteira (2)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'wave', fixacao: 'varao_suico', largura: 3, largura_tecido: 3.0 });
    expect(qtd(r, 'Ponteira')).toBe(2);
  });
});

describe('Cortina — modelos não implementados', () => {
  it('modelo desconhecido lança NotImplementedError', () => {
    expect(() => calcularCortina({ ...BASE, modelo: 'persiana' as unknown as EntradaCortina['modelo'] })).toThrow(NotImplementedError);
  });
});
