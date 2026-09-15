// apps/api/src/services/calc/corteTecido.test.ts
// Rolos e medidas reais do catálogo (12/09/2026). O caso que move a agulha é a
// peça alta e estreita: é onde girar deixa de ser detalhe e vira três vezes
// menos tecido.

import { describe, it, expect } from 'vitest';
import { melhorCorte, planejarLote, planosDeCorte, pegadaDaPeca, type RoloDisponivel } from './corteTecido';

// SCREEN 3% PANAMA OFF WHITE/01, as três larguras cadastradas pelo Victor.
const ROLOS: RoloDisponivel[] = [
  { id: '48332643', nome: 'SCREEN 3% PANAMA OFF WHITE/01 2,00M', dimensao_m: 2 },
  { id: '98232313', nome: 'SCREEN 3% PANAMA OFF WHITE/01 2,50M', dimensao_m: 2.5 },
  { id: '98232373', nome: 'SCREEN 3% PANAMA OFF WHITE/01 3,00M', dimensao_m: 3 },
];

describe('melhorCorte', () => {
  it('peça alta e estreita: girar no rolo largo ganha do corte normal no estreito', () => {
    const peca = { largura: 0.8, altura: 2.6 };
    const r = melhorCorte({ peca, rolos: ROLOS, permiteInverter: true })!;
    expect(r.orientacao).toBe('girada');
    expect(r.rolo.dimensao_m).toBe(3);
    expect(r.metros_lineares).toBe(0.8);
    expect(r.area_consumida_m2).toBeCloseTo(2.4, 4);
  });

  it('a mesma peça, tecido que não inverte: sobra o rolo mais estreito, em pé', () => {
    const peca = { largura: 0.8, altura: 2.6 };
    const r = melhorCorte({ peca, rolos: ROLOS, permiteInverter: false })!;
    expect(r.orientacao).toBe('normal');
    expect(r.rolo.dimensao_m).toBe(2);
    expect(r.metros_lineares).toBe(2.6);
    expect(r.area_consumida_m2).toBeCloseTo(5.2, 4);
  });

  it('peça larga e baixa: em pé mesmo, no rolo que couber mais justo', () => {
    const peca = { largura: 2.4, altura: 1.2 };
    const r = melhorCorte({ peca, rolos: ROLOS, permiteInverter: true })!;
    expect(r.orientacao).toBe('normal');
    expect(r.rolo.dimensao_m).toBe(2.5); // no de 2,00 não cabe
    expect(r.metros_lineares).toBe(1.2);
  });

  it('escolhe pela área retirada do rolo, não pelo comprimento', () => {
    // 0,80 m dos dois rolos dá o mesmo comprimento; o estreito tira menos área.
    const peca = { largura: 0.8, altura: 0.8 };
    const r = melhorCorte({ peca, rolos: ROLOS, permiteInverter: true })!;
    expect(r.rolo.dimensao_m).toBe(2);
    expect(r.area_consumida_m2).toBeCloseTo(1.6, 4);
  });

  it('não cabe em rolo nenhum: os dois lados passam da largura máxima', () => {
    expect(melhorCorte({ peca: { largura: 3.4, altura: 3.2 }, rolos: ROLOS, permiteInverter: true })).toBeNull();
  });

  it('peça larga demais em pé fica sem saída quando o tecido não inverte', () => {
    // 3,40 de largura não cabe em pé; girada caberia (1,00 < 3,00), mas girar
    // está proibido neste tecido.
    const peca = { largura: 3.4, altura: 1 };
    expect(melhorCorte({ peca, rolos: ROLOS, permiteInverter: false })).toBeNull();
    expect(melhorCorte({ peca, rolos: ROLOS, permiteInverter: true })!.orientacao).toBe('girada');
  });

  it('cabe girada quando em pé não caberia em rolo algum', () => {
    const peca = { largura: 4.0, altura: 1.5 };
    const r = melhorCorte({ peca, rolos: ROLOS, permiteInverter: true })!;
    expect(r.orientacao).toBe('girada');
    expect(r.metros_lineares).toBe(4);
  });

  it('1 mm de folga: medida de obra não pode ser reprovada por arredondamento', () => {
    const peca = { largura: 2.5004, altura: 1 };
    expect(melhorCorte({ peca, rolos: ROLOS, permiteInverter: false })!.rolo.dimensao_m).toBe(2.5);
  });

  it('lista todos os planos viáveis, do melhor para o pior', () => {
    const planos = planosDeCorte({ peca: { largura: 0.8, altura: 2.6 }, rolos: ROLOS, permiteInverter: true });
    expect(planos).toHaveLength(4); // 3 normais + 1 girada (só o rolo de 3,00 aceita 2,60)
    expect(planos[0].area_consumida_m2).toBeLessThan(planos[1].area_consumida_m2);
  });
});

describe('pegadaDaPeca — sai da receita, sem repetir a folga', () => {
  it('tela solar (m²): a altura volta da divisão pela largura', () => {
    // consumo = LARGURA*(ALTURA+0.2) = 2,00 × 2,00 = 4 m²
    expect(pegadaDaPeca({ largura: 2, consumo: 4, unidade: 'm²' })).toEqual({ largura: 2, altura: 2 });
  });

  it('família linear (m): o consumo já é o comprimento', () => {
    expect(pegadaDaPeca({ largura: 0.8, consumo: 2.6, unidade: 'm' })).toEqual({ largura: 0.8, altura: 2.6 });
  });
});

// O caso que o Victor descreveu: duas persianas de 0,80 × 2,40 num rolo largo.
// Hoje a Persia cobra e debita duas faixas; elas saem de uma so.
describe('planejarLote', () => {
  const rolo280: RoloDisponivel = { id: 'bk', nome: 'LINHO DIGITAL CINZA BK 2,80m', dimensao_m: 2.8 };

  it('duas peças estreitas dividem a mesma faixa', () => {
    const pecas = [
      { ref: 0, largura: 0.8, altura: 2.6 },
      { ref: 1, largura: 0.8, altura: 2.6 },
    ];
    const p = planejarLote({ pecas, rolos: [rolo280], permiteInverter: false })!;
    expect(p.faixas).toHaveLength(1);
    expect(p.metros_lineares).toBe(2.6);          // e não 5,20
    expect(p.faixas[0].sobra_largura).toBeCloseTo(1.2, 4);
    // O rateio divide a faixa entre as duas, e a soma fecha com o total.
    expect(p.consumo_por_peca[0]).toBeCloseTo(1.3, 4);
    expect(p.consumo_por_peca[1]).toBeCloseTo(1.3, 4);
    const soma = Object.values(p.consumo_por_peca).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(p.metros_lineares, 4);
  });

  it('a soma do rateio sempre fecha com o total, com peças desiguais', () => {
    const pecas = [
      { ref: 0, largura: 1.5, altura: 2.6 },
      { ref: 1, largura: 1.2, altura: 1.4 },
      { ref: 2, largura: 0.6, altura: 2.2 },
      { ref: 3, largura: 2.7, altura: 1.1 },
    ];
    const p = planejarLote({ pecas, rolos: [rolo280], permiteInverter: false })!;
    const soma = Object.values(p.consumo_por_peca).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(p.metros_lineares, 3);
    expect(Object.keys(p.consumo_por_peca)).toHaveLength(4);
  });

  it('quem ocupa mais largura leva mais da faixa, inclusive da sobra', () => {
    const pecas = [
      { ref: 0, largura: 2.0, altura: 2.0 },
      { ref: 1, largura: 0.5, altura: 2.0 },
    ];
    const p = planejarLote({ pecas, rolos: [rolo280], permiteInverter: false })!;
    expect(p.faixas).toHaveLength(1);
    expect(p.consumo_por_peca[0]).toBeGreaterThan(p.consumo_por_peca[1]);
  });

  it('peça que não cabe em pé derruba o rolo inteiro quando não se pode girar', () => {
    const pecas = [{ ref: 0, largura: 3.2, altura: 1 }];
    expect(planejarLote({ pecas, rolos: [rolo280], permiteInverter: false })).toBeNull();
    expect(planejarLote({ pecas, rolos: [rolo280], permiteInverter: true })!.metros_lineares).toBe(3.2);
  });

  it('entre rolos, escolhe pela área retirada e não pelo comprimento', () => {
    const rolos: RoloDisponivel[] = [
      { id: 'a', nome: '2,00', dimensao_m: 2 },
      { id: 'b', nome: '3,00', dimensao_m: 3 },
    ];
    // Uma peça de 1,90 × 2,00 cabe nos dois e gasta 2,00 m de comprimento em
    // ambos — mas o rolo de 2,00 tira 4 m² e o de 3,00 tira 6 m².
    const p = planejarLote({ pecas: [{ ref: 0, largura: 1.9, altura: 2 }], rolos, permiteInverter: false })!;
    expect(p.rolo.dimensao_m).toBe(2);
    expect(p.area_consumida_m2).toBeCloseTo(4, 4);
  });

  it('lote vazio não vira plano com metro nenhum', () => {
    const p = planejarLote({ pecas: [], rolos: [rolo280], permiteInverter: false })!;
    expect(p.metros_lineares).toBe(0);
    expect(p.faixas).toHaveLength(0);
  });
});
