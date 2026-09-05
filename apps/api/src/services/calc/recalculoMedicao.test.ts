import { describe, it, expect } from 'vitest';
import { recalcularComMedicao, redistribuirLargura } from './recalculoMedicao';

const soma = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;

describe('redistribuirLargura', () => {
  it('divide igual quando as folhas já eram iguais', () => {
    expect(redistribuirLargura([1.35, 1.35, 1.35], 4.5)).toEqual([1.5, 1.5, 1.5]);
  });

  it('mantém a proporção quando as folhas eram diferentes', () => {
    // 2:1 continua 2:1 depois de crescer.
    expect(redistribuirLargura([2, 1], 6)).toEqual([4, 2]);
  });

  it('fecha a soma exata mesmo quando não divide redondo', () => {
    const r = redistribuirLargura([1, 1, 1], 1);
    expect(soma(r)).toBe(1);
    expect(r).toHaveLength(3);
  });

  it('distribui a sobra de centavos sem perder nem inventar centímetro', () => {
    const r = redistribuirLargura([1, 1, 1], 10);
    expect(soma(r)).toBe(10);
  });

  it('divide igual quando não há largura anterior de onde tirar proporção', () => {
    expect(redistribuirLargura([0, 0], 3)).toEqual([1.5, 1.5]);
  });

  it('desiste quando o vão não dá nem 1cm por folha', () => {
    expect(redistribuirLargura([1, 1, 1], 0.02)).toEqual([]);
  });

  it('desiste com entrada inválida em vez de devolver lixo', () => {
    expect(redistribuirLargura([], 5)).toEqual([]);
    expect(redistribuirLargura([1], 0)).toEqual([]);
    expect(redistribuirLargura([1], Number.NaN)).toEqual([]);
  });
});

describe('recalcularComMedicao', () => {
  const itens = [
    { ambiente: 'Sala', largura: 1.5, altura: 2.2, tecido_id: '1' },
    { ambiente: 'Sala', largura: 1.5, altura: 2.2, tecido_id: '1' },
    { ambiente: 'Quarto', largura: 2, altura: 1.8, tecido_id: '2' },
  ];

  it('reparte o vão medido entre as folhas do ambiente', () => {
    const r = recalcularComMedicao(itens, [{ nome: 'Sala', largura: 3.4, altura: 2.2 }]);
    expect(r.itens[0].largura).toBe(1.7);
    expect(r.itens[1].largura).toBe(1.7);
    // Ambiente não medido fica intocado.
    expect(r.itens[2].largura).toBe(2);
  });

  it('preserva todos os outros campos do item', () => {
    const r = recalcularComMedicao(itens, [{ nome: 'Sala', largura: 3.4, altura: 2.2 }]);
    expect(r.itens[0].tecido_id).toBe('1');
    expect(r.itens[0].ambiente).toBe('Sala');
  });

  it('não altera os itens recebidos', () => {
    const original = JSON.parse(JSON.stringify(itens));
    recalcularComMedicao(itens, [{ nome: 'Sala', largura: 3.4, altura: 2.2 }]);
    expect(itens).toEqual(original);
  });

  it('ignora diferença menor que 1cm', () => {
    const r = recalcularComMedicao(itens, [{ nome: 'Sala', largura: 3.005, altura: 2.2 }]);
    expect(r.mudancas).toHaveLength(0);
    expect(r.itens[0].largura).toBe(1.5);
  });

  it('parea ambiente por nome tolerando acento, caixa e espaço', () => {
    const r = recalcularComMedicao(
      [{ ambiente: 'Área de serviço', largura: 1, altura: 2 }],
      [{ nome: '  AREA DE  SERVICO ', largura: 2, altura: 2 }],
    );
    expect(r.itens[0].largura).toBe(2);
  });

  it('reescreve a altura quando o ambiente tinha uma altura só', () => {
    const r = recalcularComMedicao(itens, [{ nome: 'Quarto', largura: 2, altura: 2.05 }]);
    expect(r.itens[2].altura).toBe(2.05);
    expect(r.mudancas[0].altura_antes).toBe(1.8);
    expect(r.mudancas[0].altura_depois).toBe(2.05);
  });

  it('não mexe na altura quando as folhas tinham alturas diferentes', () => {
    // Escada/sanca: uma medida só não sabe reproduzir alturas intencionalmente
    // distintas, então preserva o que o vendedor pôs.
    const escada = [
      { ambiente: 'Escada', largura: 1, altura: 2 },
      { ambiente: 'Escada', largura: 1, altura: 2.6 },
    ];
    const r = recalcularComMedicao(escada, [{ nome: 'Escada', largura: 2, altura: 2.3 }]);
    expect(r.itens[0].altura).toBe(2);
    expect(r.itens[1].altura).toBe(2.6);
  });

  it('relata o de-para por ambiente, folha a folha', () => {
    const r = recalcularComMedicao(itens, [{ nome: 'Sala', largura: 3.4, altura: 2.2 }]);
    expect(r.mudancas).toHaveLength(1);
    expect(r.mudancas[0]).toMatchObject({
      ambiente: 'Sala',
      folhas: 2,
      largura_antes: 3,
      largura_depois: 3.4,
      larguras_antes: [1.5, 1.5],
      larguras_depois: [1.7, 1.7],
    });
  });

  it('aponta ambiente que só existe na medição sem inventar folhas', () => {
    const r = recalcularComMedicao(itens, [
      { nome: 'Sala', largura: 3, altura: 2.2 },
      { nome: 'Varanda', largura: 5, altura: 2.4 },
    ]);
    expect(r.so_na_medicao).toEqual(['Varanda']);
    expect(r.itens).toHaveLength(3);
  });

  it('ignora item sem ambiente em vez de parear errado', () => {
    const r = recalcularComMedicao(
      [{ ambiente: null, largura: 1, altura: 2 }, { ambiente: '', largura: 1, altura: 2 }],
      [{ nome: 'Sala', largura: 9, altura: 3 }],
    );
    expect(r.itens[0].largura).toBe(1);
    expect(r.mudancas).toHaveLength(0);
  });

  it('não mexe na largura quando o vão medido não cabe nas folhas existentes', () => {
    const muitas = Array.from({ length: 5 }, () => ({ ambiente: 'Sala', largura: 1, altura: 2 }));
    const r = recalcularComMedicao(muitas, [{ nome: 'Sala', largura: 0.03, altura: 2 }]);
    expect(r.itens.every((i) => i.largura === 1)).toBe(true);
  });

  it('sem ambiente medido, devolve tudo igual', () => {
    const r = recalcularComMedicao(itens, []);
    expect(r.mudancas).toHaveLength(0);
    expect(r.so_na_medicao).toHaveLength(0);
    expect(r.itens).toEqual(itens);
  });
});
