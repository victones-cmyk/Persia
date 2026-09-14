// apps/api/src/services/calc/seletorTecido.test.ts
// Nomes tirados do catálogo real (12/09/2026). Os casos que NÃO podem agrupar
// valem mais que os que agrupam: juntar dois tecidos diferentes faria a Pérsia
// recomendar um rolo de outra cor.

import { describe, it, expect } from 'vitest';
import { agruparOpcoesDeTecido, chaveDoTecido, mesmoTecido, rolosDoMesmoTecido, temEconomia, type TecidoDoCatalogo } from './seletorTecido';

describe('chaveDoTecido', () => {
  it('ignora o sufixo de largura, em qualquer capitalização', () => {
    expect(chaveDoTecido('DOUBLE VISION BRANCO AM-3640 1,80M'))
      .toBe(chaveDoTecido('DOUBLE VISION BRANCO AM-3640 2,25M'));
    expect(chaveDoTecido('LINHO DIGITAL CINZA BK AM 5087/5689D 2,00m'))
      .toBe(chaveDoTecido('LINHO DIGITAL CINZA BK AM 5087/5689D 2,80m'));
  });

  it('não junta tecidos diferentes que só se parecem', () => {
    const a = chaveDoTecido('DOUBLE VISION BEGE AM-4478A 1,80M');
    const b = chaveDoTecido('DOUBLE VISION BEGE ESCURO AM-4478B 2,25M');
    expect(a).not.toBe(b);
    expect(chaveDoTecido('DOUBLE VISION CINZA AM-3640/8567 1,80M'))
      .not.toBe(chaveDoTecido('DOUBLE VISION CHUMBO AM-3640/12035 1,80M'));
    expect(chaveDoTecido('LINEN 07 FENDI BK C90BO-7'))
      .not.toBe(chaveDoTecido('LINEN 08 PRATA BK C90BO-8'));
  });

  it('não confunde código terminado em dígito com largura', () => {
    // "AM-3640" não pode virar "AM-364" nem sumir: o sufixo exige a vírgula.
    expect(chaveDoTecido('DOUBLE VISION BRANCO AM-3640')).toBe('DOUBLE VISION BRANCO AM-3640');
    expect(chaveDoTecido('SUPER LINHO AM 3059 LISO')).toBe('SUPER LINHO AM 3059 LISO');
  });

  it('normaliza acento e espaço duplo', () => {
    expect(chaveDoTecido('DOUBLE VISION CRETA  BRANCO TJ-5086/A'))
      .toBe('DOUBLE VISION CRETA BRANCO TJ-5086/A');
    expect(chaveDoTecido('ATHANEA CHUMBO TRANSLÚCIDO')).toBe('ATHANEA CHUMBO TRANSLUCIDO');
  });
});

describe('rolosDoMesmoTecido', () => {
  const estreito: TecidoDoCatalogo = { id: '62442182', nome: 'DOUBLE VISION BRANCO AM-3640 1,80M', dimensao_m: 1.8, preco_venda: 100 };
  const largo: TecidoDoCatalogo = { id: '43047444', nome: 'DOUBLE VISION BRANCO AM-3640 2,25M', dimensao_m: 2.25, preco_venda: 130 };
  const outro: TecidoDoCatalogo = { id: '70155748', nome: 'DOUBLE VISION BEGE AM-4478A 2,25M', dimensao_m: 2.25, preco_venda: 130 };
  const catalogo = [estreito, largo, outro];
  // Família linear: 2 m de tecido por peça, qualquer que seja o rolo.
  const preco = (t: TecidoDoCatalogo) => t.preco_venda * 2;

  it('recomenda o mais barato que cabe e mostra a diferença', () => {
    const r = rolosDoMesmoTecido({ selecionado: largo, catalogo, largura: 1.5, precoDaPeca: preco });
    expect(r.map((x) => x.dimensao_m)).toEqual([1.8, 2.25]);
    expect(r[0]).toMatchObject({ recomendado: true, selecionado: false, valor: 200, diferenca: -60, cabe: true });
    expect(r[1]).toMatchObject({ recomendado: false, selecionado: true, diferenca: 0 });
    expect(temEconomia(r)).toBe(true);
  });

  it('não recomenda rolo onde a peça não cabe, por mais barato que seja', () => {
    const r = rolosDoMesmoTecido({ selecionado: largo, catalogo, largura: 2.0, precoDaPeca: preco });
    const estreitoR = r.find((x) => x.dimensao_m === 1.8)!;
    expect(estreitoR).toMatchObject({ cabe: false, recomendado: false });
    expect(estreitoR.folga_m).toBeLessThan(0);
    expect(r.find((x) => x.dimensao_m === 2.25)!.recomendado).toBe(true);
    expect(temEconomia(r)).toBe(false);
  });

  it('deixa o outro tecido de fora', () => {
    const r = rolosDoMesmoTecido({ selecionado: largo, catalogo, largura: 1.5, precoDaPeca: preco });
    expect(r.map((x) => x.id)).not.toContain(outro.id);
  });

  it('tecido de rolo único não vira lista', () => {
    expect(rolosDoMesmoTecido({ selecionado: outro, catalogo, largura: 1.5, precoDaPeca: preco })).toEqual([]);
  });

  it('já estando no mais barato, não há economia a anunciar', () => {
    const r = rolosDoMesmoTecido({ selecionado: estreito, catalogo, largura: 1.5, precoDaPeca: preco });
    expect(r.find((x) => x.selecionado)!.recomendado).toBe(true);
    expect(temEconomia(r)).toBe(false);
  });

  it('empate de preço fica com o rolo mais estreito', () => {
    const mesmoPreco = (t: TecidoDoCatalogo) => (t.id === outro.id ? 999 : 200);
    const r = rolosDoMesmoTecido({ selecionado: largo, catalogo, largura: 1.5, precoDaPeca: mesmoPreco });
    expect(r.find((x) => x.recomendado)!.dimensao_m).toBe(1.8);
  });
});

// O campo "COD TECIDO" existe para tirar o agrupamento da dependência do nome.
// Os casos que importam são os dois extremos do cadastro: o que ele conserta
// quando está completo, e o que ele NÃO pode estragar enquanto está pela metade.
describe('mesmoTecido — campo COD TECIDO', () => {
  const t = (id: string, nome: string, codigo_tecido = '', dimensao_m = 2): TecidoDoCatalogo =>
    ({ id, nome, dimensao_m, preco_venda: 100, codigo_tecido });

  it('sem campo em nenhum dos dois, vale o nome', () => {
    expect(mesmoTecido(t('1', 'DOUBLE VISION BRANCO AM-3640 1,80M'), t('2', 'DOUBLE VISION BRANCO AM-3640 2,25M'))).toBe(true);
    expect(mesmoTecido(t('1', 'DOUBLE VISION BRANCO AM-3640 1,80M'), t('2', 'DOUBLE VISION PRETO AM-3640 1,80M'))).toBe(false);
  });

  it('com campo nos dois, o campo manda — junta o que o nome separaria', () => {
    const a = t('1', 'DV BRANCO ROLO ANTIGO', 'AM-3640 BRANCO');
    const b = t('2', 'DOUBLE VISION BRANCO AM-3640 2,25M', 'AM-3640 BRANCO');
    expect(mesmoTecido(a, b)).toBe(true);
  });

  it('com campo nos dois, o campo manda — separa o que o nome juntaria', () => {
    const a = t('1', 'DOUBLE VISION BRANCO AM-3640 1,80M', 'AM-3640 BRANCO');
    const b = t('2', 'DOUBLE VISION BRANCO AM-3640 2,25M', 'AM-3640 BRANCO GELO');
    expect(mesmoTecido(a, b)).toBe(false);
  });

  it('preenchido pela metade não perde o agrupamento que o nome já dava', () => {
    const comCodigo = t('1', 'DOUBLE VISION BRANCO AM-3640 1,80M', 'AM-3640 BRANCO');
    const semCodigo = t('2', 'DOUBLE VISION BRANCO AM-3640 2,25M');
    expect(mesmoTecido(comCodigo, semCodigo)).toBe(true);
  });

  it('ignora caixa e espaço no código', () => {
    expect(mesmoTecido(t('1', 'A', 'am-3640 branco'), t('2', 'B', 'AM-3640 BRANCO'))).toBe(true);
  });

  it('código em branco conta como não cadastrado', () => {
    expect(mesmoTecido(t('1', 'DOUBLE VISION BRANCO AM-3640 1,80M', '   '), t('2', 'DOUBLE VISION PRETO AM-3640 1,80M', 'X'))).toBe(false);
  });
});

// O cadastro das tres larguras da tela solar virou 30 linhas na busca, e o
// vendedor passou a escolher ROLO em vez de TECIDO — escolhendo o de 2,00 m,
// uma peca de 3,00 m era recusada, sendo que o tecido existe em 3,00.
describe('agruparOpcoesDeTecido', () => {
  const t = (id: string, nome: string, dimensao_m: number, preco_venda: number): TecidoDoCatalogo =>
    ({ id, nome, dimensao_m, preco_venda });

  const screen = [
    t('s200', 'SCREEN 3% PANAMA OFF WHITE/01 2,00M', 2, 42),
    t('s250', 'SCREEN 3% PANAMA OFF WHITE/01 2,50M', 2.5, 42),
    t('s300', 'SCREEN 3% PANAMA OFF WHITE/01 3,00M', 3, 42),
  ];

  it('mesmo preço vira uma opção só, representada pela largura maior', () => {
    const r = agruparOpcoesDeTecido(screen);
    expect(r).toHaveLength(1);
    expect(r[0].dimensao_m).toBe(3);
    expect(r[0].larguras_m).toEqual([2, 2.5, 3]);
  });

  it('o nome perde o sufixo de largura — o grupo corta em qualquer uma', () => {
    expect(agruparOpcoesDeTecido(screen)[0].nome).toBe('SCREEN 3% PANAMA OFF WHITE/01');
  });

  it('preços diferentes continuam separados: aí o rolo muda o valor do cliente', () => {
    const dv = [
      t('dv180', 'DOUBLE VISION BRANCO AM-3640 1,80M', 1.8, 90),
      t('dv225', 'DOUBLE VISION BRANCO AM-3640 2,25M', 2.25, 130),
    ];
    const r = agruparOpcoesDeTecido(dv);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.nome)).toEqual([
      'DOUBLE VISION BRANCO AM-3640 1,80M',
      'DOUBLE VISION BRANCO AM-3640 2,25M',
    ]);
  });

  it('tecido de rolo único não perde o nome que tem', () => {
    const unico = [t('u', 'LAGUNA CINZA BK', 2, 131.3)];
    const r = agruparOpcoesDeTecido(unico);
    expect(r[0].nome).toBe('LAGUNA CINZA BK');
    expect(r[0].larguras_m).toEqual([2]);
  });

  it('não mistura tecidos diferentes que por acaso custam igual', () => {
    const r = agruparOpcoesDeTecido([
      t('a', 'SCREEN 3% PANAMA OFF WHITE/01 2,00M', 2, 42),
      t('b', 'SCREEN 3% PANAMA PRETO/50 2,00M', 2, 42),
    ]);
    expect(r).toHaveLength(2);
  });
});

describe('o seletor da Fase 2 some quando não há o que decidir', () => {
  const mesmo = (id: string, nome: string, dimensao_m: number): TecidoDoCatalogo =>
    ({ id, nome, dimensao_m, preco_venda: 42 });
  it('rolos de preço igual não viram pergunta ao vendedor', () => {
    const catalogo = [
      mesmo('s200', 'SCREEN 3% PANAMA OFF WHITE/01 2,00M', 2),
      mesmo('s300', 'SCREEN 3% PANAMA OFF WHITE/01 3,00M', 3),
    ];
    const r = rolosDoMesmoTecido({ selecionado: catalogo[1], catalogo, largura: 1.5, precoDaPeca: () => 100 });
    expect(r).toEqual([]);
  });
});
