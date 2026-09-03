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
  it('usa componentes da cor escolhida quando existem no indice do GestaoClick', () => {
    const componentesPorNome = new Map<string, { codigo_interno: string; nome: string; preco: number }>([
      ['KIT COMANDO 38MM COR BEGE', { codigo_interno: 'KIT-BEGE', nome: 'KIT COMANDO 38MM COR BEGE', preco: 42 }],
      ['BASE CONICA COR BEGE', { codigo_interno: 'BASE-BEGE', nome: 'BASE CONICA COR BEGE', preco: 19.5 }],
      ['TAMPA DA BASE CONICA COR BEGE', { codigo_interno: 'TAMPA-BASE-BEGE', nome: 'TAMPA DA BASE CONICA COR BEGE', preco: 0.9 }],
    ]);

    const r = calcularPrecoPersiana({
      tipo: 'persiana_rolo_blackout',
      acionamento: 'com_barra',
      largura: 2,
      altura: 1.8,
      tc: 1.5,
      preco_tecido: 0,
      precos: new Map(),
      componentesPorNome,
      cor_acessorio: 'Bege',
      cor_base: 'Bege',
    });

    expect(r.itens).toEqual(expect.arrayContaining([
      expect.objectContaining({ codigo_interno: 'KIT-BEGE', descricao: 'KIT COMANDO 38MM COR BEGE' }),
      expect.objectContaining({ codigo_interno: 'BASE-BEGE', descricao: 'BASE CONICA COR BEGE' }),
      expect.objectContaining({ codigo_interno: 'TAMPA-BASE-BEGE', descricao: 'TAMPA DA BASE CONICA COR BEGE' }),
    ]));
    expect(r.itens.some((i) => /KIT COMANDO 38MM COR BRANCO/.test(i.descricao))).toBe(false);
  });

  it('rolo_bk_translucido/com_bando = R$ 654.32', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(654.32);
  });
  it('rolo_bk_translucido/sem_bando = R$ 565.12', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
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
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_screen', acionamento: 'com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(557.24);
  });
  it('tela_solar/sem_bando = R$ 468.04', () => {
    const precos = new Map<string, number>([['5014037651965',25],['9232349342193',42],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['989396838987',0.3],['4627438942116',0.3],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_screen', acionamento: 'com_barra', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(468.04);
  });
});

describe('calcularPrecoPersiana — MOTORIZADA (planilhas v.2, 26/06/2026)', () => {
  it('rolo motor com bandô = R$ 1279.52', () => {
    const precos = new Map<string, number>([['8546431434033',31.54],['9001976',640],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['2041749670169',38.98],['3211432323511',4]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'motorizado_com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(1279.52);
  });
  it('rolo motor sem bandô = R$ 1198.32 (TUBO acompanha largura + KIT INSTALAÇÃO qtd 1 — engano da planilha corrigido pelo Victor 26/06/2026)', () => {
    const precos = new Map<string, number>([['8546431434033',31.54],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['9001976',640],['2041749670169',38.98],['5752963489736',8],['3211432323511',4]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'motorizado_sem_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(1198.32);
  });
  it('double_vision motor com bandô = R$ 1443.23', () => {
    const precos = new Map<string, number>([['8546431434033',31.54],['9001976',640],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['1813672176852',11.6],['8312865953308',12.6],['306266001647',3.2],['6268408018170',3],['4301597855822',1.6],['2041749670169',38.98],['5752963489736',8],['3211432323511',4]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_double_vision', acionamento: 'motorizado_com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 100, precos });
    expect(r.valor).toBe(1443.23);
  });
  it('double_vision motor sem bandô = R$ 1349.50', () => {
    const precos = new Map<string, number>([['8546431434033',31.54],['9001976',640],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['4301597855822',1.6],['6493825583669',11.6],['8312865953308',12.6],['7620761718926',0.9],['6268408018170',3],['2041749670169',38.98],['5752963489736',8],['3211432323511',4]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_double_vision', acionamento: 'motorizado_sem_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 100, precos });
    expect(r.valor).toBe(1349.50);
  });
  // Tela solar motor = mesma receita do rolo motor, só o tecido por m² (Victor 26/06/2026).
  it('tela_solar motor com bandô = R$ 1182.44 (tecido por m²)', () => {
    const precos = new Map<string, number>([['8546431434033',31.54],['9001976',640],['4650887475882',25],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['2041749670169',38.98],['3211432323511',4]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_screen', acionamento: 'motorizado_com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(1182.44);
    expect(r.tecido.quantidade).toBe(4.8); // m²
  });
  it('tela_solar motor sem bandô = R$ 1101.24', () => {
    const precos = new Map<string, number>([['8546431434033',31.54],['4650887475882',25],['2009102737805',1.1],['2067932865600',7],['9964894129649',24],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['9001976',640],['2041749670169',38.98],['5752963489736',8],['3211432323511',4]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_screen', acionamento: 'motorizado_sem_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(1101.24);
  });
});

describe('calcularPrecoPersiana — EMISSOR (Victor 01/08/2026)', () => {
  const precos = new Map<string, number>([['8546431434033', 31.54], ['9001976', 640], ['4650887475882', 25], ['2048469075809', 6.9], ['2067932865600', 7], ['6797020744804', 57], ['888818154157', 7], ['6016973683643', 1.1], ['9811648898558', 19.5], ['7620761718926', 0.9], ['6268408018170', 3], ['2041749670169', 38.98], ['3211432323511', 4], ['9302760', 89.9]]);

  it('sem emissor (padrão) não soma nada extra: bate com o valor motorizado sem emissor', () => {
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'motorizado_com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(1279.52);
    expect(r.itens.some((i) => /EMISSOR/i.test(i.descricao))).toBe(false);
  });

  it('emissor=true sem componente_emissor não soma nada (precisa do produto escolhido)', () => {
    const r = calcularPrecoPersiana({ tipo: 'persiana_rolo_blackout', acionamento: 'motorizado_com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos, emissor: true });
    expect(r.valor).toBe(1279.52);
  });

  it('emissor=true + componente_emissor soma o preço do produto escolhido pelo vendedor', () => {
    const r = calcularPrecoPersiana({
      tipo: 'persiana_rolo_blackout',
      acionamento: 'motorizado_com_bando',
      largura: 2, altura: 1.8, tc: 1.5,
      preco_tecido: 132.54,
      precos,
      emissor: true,
      componente_emissor: { codigo_interno: '9302760', descricao: 'EMISSOR RADIO FREQ 1 CAN AJUSTE FINO (UDC301) BCO' },
    });
    expect(r.valor).toBe(1279.52 + 89.9);
    expect(r.itens).toEqual(expect.arrayContaining([
      expect.objectContaining({ codigo_interno: '9302760', descricao: 'EMISSOR RADIO FREQ 1 CAN AJUSTE FINO (UDC301) BCO', quantidade: 1, preco: 89.9, subtotal: 89.9 }),
    ]));
  });
});

describe('calcularPrecoPersiana — ROMANA (planilha v.2, sem motor)', () => {
  it('romana com bandô = R$ 722.21 (cavalete cobrado + kit no preço próprio + guia hastes×cavaletes)', () => {
    const precos = new Map<string, number>([['3237927054197',6.4],['2080773633009',9.6],['1105743980119',30],['4599413356039',34],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['7728566453204',7.8],['6008299138556',1.4],['4713039221861',3],['5520965910948',0.5],['2003520573908',4.9],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94],['2039898687701',0.5]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_romana_blackout', acionamento: 'com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(722.21);
  });
  it('romana sem bandô = R$ 566.61', () => {
    const precos = new Map<string, number>([['3237927054197',6.4],['2080773633009',9.6],['1105743980119',30],['4599413356039',34],['2067932865600',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['7728566453204',7.8],['6008299138556',1.4],['4713039221861',3],['5520965910948',0.5],['2003520573908',4.9],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94],['2039898687701',0.5]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_romana_blackout', acionamento: 'com_barra', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 132.54, precos });
    expect(r.valor).toBe(566.61);
  });
  // ROMANA TELA SOLAR (persiana_romana_screen): mesmos componentes, tecido por m² (× LARGURA). Planilha v.3.
  it('romana tela solar com bandô = R$ 600.26 (tecido por m²)', () => {
    const precos = new Map<string, number>([['3237927054197',6.4],['2080773633009',9.6],['1105743980119',30],['4599413356039',34],['2048469075809',6.9],['2067932865600',7],['6797020744804',57],['888818154157',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['7728566453204',7.8],['6008299138556',1.4],['4713039221861',3],['5520965910948',0.5],['2003520573908',4.9],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94],['2039898687701',0.5]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_romana_screen', acionamento: 'com_bando', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(600.26);
    expect(r.tecido.quantidade).toBe(3.9); // m²
  });
  it('romana tela solar sem bandô = R$ 444.66', () => {
    const precos = new Map<string, number>([['3237927054197',6.4],['2080773633009',9.6],['1105743980119',30],['4599413356039',34],['2067932865600',7],['6016973683643',1.1],['9811648898558',19.5],['7620761718926',0.9],['6268408018170',3],['7728566453204',7.8],['6008299138556',1.4],['4713039221861',3],['5520965910948',0.5],['2003520573908',4.9],['5752963489736',8],['4366261029463',10],['3211432323511',4],['1069063700105',1.94],['2039898687701',0.5]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_romana_screen', acionamento: 'com_barra', largura: 2, altura: 1.8, tc: 1.5, preco_tecido: 35, precos });
    expect(r.valor).toBe(444.66);
  });
  it('romana com altura maior usa mais hastes (2.5m → 6 hastes)', () => {
    const precos = new Map<string, number>([['4713039221861',3],['5520965910948',0.5],['2039898687701',0.5]]);
    const r = calcularPrecoPersiana({ tipo: 'persiana_romana_blackout', acionamento: 'com_barra', largura: 2, altura: 2.5, tc: 1.5, preco_tecido: 0, precos });
    const haste = r.itens.find((i) => /HASTE ROMANA/.test(i.descricao));
    expect(haste?.quantidade).toBe(12); // 6 hastes × largura 2
  });
});

describe('calcularPrecoPersiana — receitas pendentes', () => {
  const precos = new Map<string, number>();
  it('romana motorizada lança ReceitaPendenteError (não existe — Victor)', () => {
    expect(() => calcularPrecoPersiana({ tipo: 'persiana_romana_blackout', acionamento: 'motorizado_com_bando', largura: 2, altura: 2, tc: 1.5, preco_tecido: 100, precos })).toThrow(ReceitaPendenteError);
  });
});
