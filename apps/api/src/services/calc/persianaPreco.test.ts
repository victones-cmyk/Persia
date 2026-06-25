// apps/api/src/services/calc/persianaPreco.test.ts
// Casos GERADOS das planilhas do Victor — travam o motor de preço da persiana (v.5.1).
import { describe, it, expect } from 'vitest';
import { calcularPrecoPersiana, ReceitaPendenteError } from './persianaPreco';
import { evalQuantidade } from './formula';

describe('evalQuantidade (avaliador com parênteses)', () => {
  const v = { largura: 2, altura: 1.8, tc: 1.5 };
  it('respeita parênteses', () => { expect(evalQuantidade('(LARGURA-0.025)*2', v)).toBeCloseTo(3.95, 6); });
  it('largura/0.5', () => { expect(evalQuantidade('LARGURA/0.5', v)).toBe(4); });
  it('m²: LARGURA*(ALTURA+0.2)*1.2', () => { expect(evalQuantidade('LARGURA*(ALTURA+0.2)*1.2', v)).toBeCloseTo(4.8, 6); });
  it('TC', () => { expect(evalQuantidade('TC*2', v)).toBe(3); });
});

describe('calcularPrecoPersiana — bate com a planilha do Victor', () => {
  it('rolo_bk_translucido/com_bando = R$ 654.32', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['3267387682319',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(654.32);
  });
  it('rolo_bk_translucido/sem_bando = R$ 565.12', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['3267387682319',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'com_barra', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(565.12);
  });
  it('double_vision/com_bando = R$ 810.03', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['1813672176852',11.6],['8312865953308',12.6],['306266001647',3.2],['6268408018170',3],['4301597855822',1.6],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_double_vision', acionamento: 'com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 100, precos });
    expect(r.valor).toBe(810.03);
  });
  it('double_vision/sem_bando = R$ 716.29', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['4301597855822',1.6],['6493825583669',11.6],['8312865953308',12.6],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_double_vision', acionamento: 'com_barra', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 100, precos });
    expect(r.valor).toBe(716.29);
  });
  it('tela_solar/com_bando = R$ 557.24', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['3267387682319',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_screen', acionamento: 'com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(557.24);
  });
  it('tela_solar/sem_bando = R$ 468.04', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['3267387682319',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_screen', acionamento: 'com_barra', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(468.04);
  });
});

describe('calcularPrecoPersiana — receitas pendentes', () => {
  const precos = new Map<string, number>();
  it('romana lança ReceitaPendenteError', () => {
    expect(() => calcularPrecoPersiana({ tipo: 'persiana_romana_blackout', acionamento: 'com_bando', largura: 2, altura: 2, tc: 1.5, preco_tecido: 100, precos })).toThrow(ReceitaPendenteError);
  });
  it('motorizado lança ReceitaPendenteError', () => {
    expect(() => calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'motorizado_com_bando', largura: 2, altura: 2, tc: 1.5, preco_tecido: 100, precos })).toThrow(ReceitaPendenteError);
  });
});
