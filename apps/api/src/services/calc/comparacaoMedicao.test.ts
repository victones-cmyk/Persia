import { describe, it, expect } from 'vitest';
import { compararMedicao, temDivergencia } from './comparacaoMedicao';

const medido = (nome: string, largura: number, altura: number) => ({ nome, largura, altura, medido: true });

describe('compararMedicao', () => {
  it('acusa a diferença do caso real: cliente passou a medida e o técnico achou outra', () => {
    const c = compararMedicao(
      [{ ambiente: 'Sala', largura: 1.6, altura: 1.6 }],
      [medido('Sala', 1.72, 1.58)],
    );

    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      ambiente: 'Sala',
      folhas: 1,
      largura_orcada: 1.6, altura_orcada: 1.6,
      largura_medida: 1.72, altura_medida: 1.58,
      diferenca_largura: 0.12,
      diferenca_altura: -0.02,
      situacao: 'difere',
    });
  });

  it('soma as folhas para comparar com o vão medido', () => {
    const folhas = Array.from({ length: 8 }, () => ({ ambiente: 'Sacada', largura: 1.35, altura: 2.5 }));

    const c = compararMedicao(folhas, [medido('Sacada', 10.8, 2.5)]);

    expect(c[0]).toMatchObject({ folhas: 8, largura_orcada: 10.8, situacao: 'igual', diferenca_largura: 0 });
  });

  it('pareia mesmo com acento, caixa e espaço diferentes', () => {
    const c = compararMedicao(
      [{ ambiente: '  SACADA  ', largura: 2, altura: 2 }],
      [medido('Sacadá', 2, 2)],
    );

    expect(c).toHaveLength(1);
    expect(c[0].situacao).toBe('igual');
  });

  it('ignora diferença de 1cm para baixo — é arredondamento, não remedição', () => {
    const c = compararMedicao(
      [{ ambiente: 'Sala', largura: 2.0, altura: 2.5 }],
      [medido('Sala', 2.005, 2.5)],
    );

    expect(c[0].situacao).toBe('igual');
  });

  it('marca ambiente que só existe no orçamento', () => {
    const c = compararMedicao(
      [{ ambiente: 'Cozinha', largura: 1, altura: 2 }],
      [medido('Sala', 2, 2)],
    );

    expect(c.find((x) => x.ambiente === 'Cozinha')).toMatchObject({ situacao: 'so_no_orcamento', largura_medida: null });
  });

  it('marca ambiente que o técnico mediu e o orçamento não tem', () => {
    const c = compararMedicao([{ ambiente: 'Sala', largura: 2, altura: 2 }], [medido('Sala', 2, 2), medido('Quarto', 3, 2.4)]);

    expect(c.find((x) => x.ambiente === 'Quarto')).toMatchObject({
      situacao: 'so_na_medicao', folhas: 0, largura_orcada: null, largura_medida: 3,
    });
  });

  it('não inventa altura única quando as folhas divergem entre si', () => {
    const c = compararMedicao(
      [{ ambiente: 'Sala', largura: 1, altura: 2.5 }, { ambiente: 'Sala', largura: 1, altura: 2.8 }],
      [medido('Sala', 2, 2.5)],
    );

    expect(c[0].altura_orcada).toBeNull();
    expect(c[0].diferenca_altura).toBeNull();
  });

  it('ignora ambiente sem medida estruturada — não há o que comparar', () => {
    const c = compararMedicao(
      [{ ambiente: 'Sala', largura: 2, altura: 2 }],
      [{ nome: 'Sala', largura: null, altura: null, medido: false }],
    );

    expect(c[0].situacao).toBe('so_no_orcamento');
  });

  it('ignora item sem ambiente, que não teria como ser pareado', () => {
    const c = compararMedicao(
      [{ ambiente: '', largura: 2, altura: 2 }, { ambiente: null, largura: 1, altura: 1 }],
      [medido('Sala', 2, 2)],
    );

    expect(c).toHaveLength(1);
    expect(c[0].situacao).toBe('so_na_medicao');
  });
});

describe('temDivergencia', () => {
  it('é falso quando tudo bate', () => {
    expect(temDivergencia(compararMedicao([{ ambiente: 'Sala', largura: 2, altura: 2 }], [medido('Sala', 2, 2)]))).toBe(false);
  });

  it('é verdadeiro quando alguma medida mudou', () => {
    expect(temDivergencia(compararMedicao([{ ambiente: 'Sala', largura: 2, altura: 2 }], [medido('Sala', 2.3, 2)]))).toBe(true);
  });

  it('é verdadeiro quando o técnico mediu um ambiente que o orçamento não tem', () => {
    expect(temDivergencia(compararMedicao([{ ambiente: 'Sala', largura: 2, altura: 2 }], [medido('Sala', 2, 2), medido('Quarto', 3, 2)]))).toBe(true);
  });
});

describe('larguras por folha', () => {
  it('devolve a largura de cada folha, para reconhecer duas faces no mesmo nome', () => {
    // Sacada real: 4 folhas de 1,24 na frente e 1 de 1,06 na lateral. Somadas dão
    // 6,02, mas isso não é um vão só — e é justamente o que a tela precisa avisar
    // antes de repartir uma medida nova entre as cinco.
    const itens = [
      { ambiente: 'SACADA', largura: 1.24, altura: 2.27 },
      { ambiente: 'SACADA', largura: 1.24, altura: 2.27 },
      { ambiente: 'SACADA', largura: 1.24, altura: 2.27 },
      { ambiente: 'SACADA', largura: 1.24, altura: 2.27 },
      { ambiente: 'SACADA', largura: 1.06, altura: 2.27 },
    ];
    const c = compararMedicao(itens, [{ nome: 'SACADA', largura: 6.2, altura: 2.27, medido: true }]);
    expect(c[0].larguras_orcadas).toEqual([1.24, 1.24, 1.24, 1.24, 1.06]);
    expect(new Set(c[0].larguras_orcadas).size).toBe(2); // é o sinal de duas faces
  });

  it('folhas iguais dão um conjunto de um valor só', () => {
    const itens = Array.from({ length: 3 }, () => ({ ambiente: 'Sala', largura: 1.5, altura: 2 }));
    const c = compararMedicao(itens, [{ nome: 'Sala', largura: 4.8, altura: 2, medido: true }]);
    expect(new Set(c[0].larguras_orcadas).size).toBe(1);
  });

  it('ambiente que só existe na medição não tem folhas', () => {
    const c = compararMedicao([], [{ nome: 'Lavabo', largura: 1, altura: 2, medido: true }]);
    expect(c[0].larguras_orcadas).toEqual([]);
  });
});

describe('faces medidas', () => {
  it('leva adiante em quantas partes o técnico mediu', () => {
    // Caso real da OS 832: a sacada foi medida em duas partes, somando 2,70.
    // O orçamento tem 2 folhas iguais — então nada denuncia a divisão pelo lado
    // do orçamento, e é o número de faces que precisa avisar.
    const itens = [
      { ambiente: 'Sacada', largura: 1.3, altura: 2.48 },
      { ambiente: 'Sacada', largura: 1.3, altura: 2.48 },
    ];
    const c = compararMedicao(itens, [{ nome: 'Sacada', largura: 2.7, altura: 2.48, medido: true, faces: 2 }]);
    expect(c[0].faces_medidas).toBe(2);
    expect(new Set(c[0].larguras_orcadas).size).toBe(1); // folhas iguais: só as faces denunciam
  });

  it('ambiente medido de uma vez tem uma face', () => {
    const c = compararMedicao(
      [{ ambiente: 'Sala', largura: 2, altura: 2 }],
      [{ nome: 'Sala', largura: 2.5, altura: 2, medido: true, faces: 1 }],
    );
    expect(c[0].faces_medidas).toBe(1);
  });

  it('ambiente do orçamento que o técnico não mediu não tem faces', () => {
    const c = compararMedicao([{ ambiente: 'Sala', largura: 2, altura: 2 }], []);
    expect(c[0].faces_medidas).toBe(0);
  });
});
