import { describe, it, expect } from 'vitest';
import {
  calcularCortinaIlhos,
  calcularCortina,
  NotImplementedError,
  type EntradaCortinaIlhos,
  type ResultadoCortinaIlhos,
} from './cortina';

// Preços de exemplo da planilha "CORTINA SOB MEDIDA" do Victor.
const PRECO: Record<string, number> = {
  'Tecido (frente)': 50,
  'Tecido (forro)': 20,
  'Tecido (trás)': 20,
  Varão: 13,
  'Varão (traseiro)': 13,
  Suporte: 5,
  'Suporte duplo': 5,
  Ilhoses: 0.3,
  Argolas: 0.2,
  Ponteira: 5,
  'Ponteira (frente)': 5,
  'Ponteira (trás)': 5,
};
const SUPORTE_MANUAL = 3; // o vendedor lança; na planilha foram 3
const INSTALACAO = 140;

/** Reproduz o total da planilha: itens × preço (suporte manual = 3) + instalação. */
function totalPlanilha(r: ResultadoCortinaIlhos): number {
  let total = 0;
  for (const it of r.itens) {
    const qtd = it.auto ? it.quantidade : SUPORTE_MANUAL; // único item manual é o suporte
    total += qtd * (PRECO[it.item] ?? 0);
  }
  return total + INSTALACAO;
}

const BASE: EntradaCortinaIlhos = {
  largura: 3,
  altura: 2.6,
  largura_tecido: 3.0,
  config: 'um_tecido',
  franzido_frente: 3,
  franzido_tras: 2,
  tamanho_barra: 0.1,
  tipo_barra: 'dupla',
  aberturas: 1,
};

describe('Cortina modelo Ilhós — planilha do Victor', () => {
  it('caso 1: um tecido (varão simples) → total R$ 672', () => {
    const r = calcularCortinaIlhos({ ...BASE, config: 'um_tecido' });
    expect(r.metodo).toBe('normal');
    expect(r.barra_consumo).toBe(0.3);
    expect(r.metragem_frente).toBe(9);
    expect(r.metragem_tras).toBeNull();
    expect(r.ilhoses).toBe(60);
    expect(totalPlanilha(r)).toBe(672);
  });

  it('caso 2: dois tecidos no mesmo varão (forro) → total R$ 852', () => {
    const r = calcularCortinaIlhos({ ...BASE, config: 'dois_tecidos_mesmo_varao' });
    expect(r.metragem_frente).toBe(9);
    expect(r.metragem_tras).toBe(9); // forro acompanha a frente
    expect(totalPlanilha(r)).toBe(852);
  });

  it('caso 3: dois tecidos em varão duplo → total R$ 847', () => {
    const r = calcularCortinaIlhos({ ...BASE, config: 'dois_tecidos_varao_duplo' });
    expect(r.metragem_frente).toBe(9);
    expect(r.metragem_tras).toBe(6); // trás usa o próprio franzido (2)
    const argolas = r.itens.find((i) => i.item === 'Argolas');
    expect(argolas?.quantidade).toBe(30); // 1 a cada 10 cm de varão (3 m)
    expect(totalPlanilha(r)).toBe(847);
  });
});

describe('Cortina modelo Ilhós — método de emenda (altura > largura do tecido)', () => {
  it('exemplo Cortinas Fênix: 3,50 × 3,00 em tecido 2,80 → 4 tiras × 3,30 = 13,20 m', () => {
    const r = calcularCortinaIlhos({
      largura: 3.5,
      altura: 3.0,
      largura_tecido: 2.8,
      config: 'um_tecido',
      franzido_frente: 2.6,
      tamanho_barra: 0.1,
      tipo_barra: 'dupla',
    });
    expect(r.metodo).toBe('emenda');
    expect(r.consumo_frente).toBe(9.1);
    expect(r.tiras_frente).toBe(4); // ceil(9,10 / 2,80) = 4
    expect(r.metragem_frente).toBe(13.2); // 4 × (3,00 + 0,30)
  });
});

describe('Cortina modelo Ilhós — arredondamentos', () => {
  it('ilhós sempre para cima até par (regra Victor: 43 → 44)', () => {
    // consumo 6,45 → 6,45/0,15 = 43 → par → 44 (com folga p/ não ficar exato testamos 6,46)
    const r = calcularCortinaIlhos({ ...BASE, largura: 2.15, franzido_frente: 3.0001, aberturas: 0 });
    expect(r.ilhoses % 2).toBe(0);
    expect(r.ilhoses).toBe(44);
  });

  it('mais de uma abertura → ilhós em múltiplo de 4', () => {
    const r = calcularCortinaIlhos({ ...BASE, largura: 2.15, franzido_frente: 3.0001, aberturas: 2 });
    expect(r.ilhoses % 4).toBe(0);
  });
});

describe('Cortina — modelos não implementados', () => {
  it('calcularCortina genérico ainda lança NotImplementedError', () => {
    expect(() => calcularCortina()).toThrow(NotImplementedError);
  });
});
