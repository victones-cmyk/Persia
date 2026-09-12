// apps/api/src/services/calc/seletorTecido.test.ts
// Nomes tirados do catálogo real (12/09/2026). Os casos que NÃO podem agrupar
// valem mais que os que agrupam: juntar dois tecidos diferentes faria a Pérsia
// recomendar um rolo de outra cor.

import { describe, it, expect } from 'vitest';
import { chaveDoTecido, mesmoTecido, rolosDoMesmoTecido, temEconomia, type TecidoDoCatalogo } from './seletorTecido';

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
