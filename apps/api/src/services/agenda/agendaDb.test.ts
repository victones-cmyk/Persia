import { describe, it, expect } from 'vitest';
import { normalizarAmbiente } from './agendaDb';

describe('normalizarAmbiente', () => {
  it('lê um ambiente com medida estruturada', () => {
    const a = normalizarAmbiente({
      id: '5ab3fef1-b692-40e0-b1c3-a0e753129d13',
      name: 'Sacada',
      largura: 10.8,
      altura: 2.5,
      folhas_sugeridas: 8,
      info: 'teto ao chão',
      photos: ['/uploads/2026-09-03/ID_827/foto.jpg'],
    });

    expect(a).toEqual({
      id: '5ab3fef1-b692-40e0-b1c3-a0e753129d13',
      nome: 'Sacada',
      tipo_produto: null,
      trilho_especial: false,
      largura: 10.8,
      altura: 2.5,
      folhas_sugeridas: 8,
      observacao: 'teto ao chão',
      fotos: ['https://agenda.texhaus.com.br/uploads/2026-09-03/ID_827/foto.jpg'],
      medido: true,
    });
  });

  it('marca como não medido o registro antigo, com a medida no texto livre', () => {
    const a = normalizarAmbiente({ name: 'Sacada', info: '2.25 x 1.75 ', photos: [] });

    expect(a).toMatchObject({
      id: null,
      nome: 'Sacada',
      largura: null,
      altura: null,
      folhas_sugeridas: null,
      observacao: '2.25 x 1.75',
      medido: false,
    });
  });

  it('exige as duas medidas para considerar medido', () => {
    expect(normalizarAmbiente({ name: 'Sala', largura: 2.5 })?.medido).toBe(false);
    expect(normalizarAmbiente({ name: 'Sala', altura: 2.5 })?.medido).toBe(false);
    expect(normalizarAmbiente({ name: 'Sala', largura: 2.5, altura: 1.8 })?.medido).toBe(true);
  });

  it('descarta medida inválida, zerada ou não numérica', () => {
    const a = normalizarAmbiente({ name: 'Sala', largura: 0, altura: 'abc', folhas_sugeridas: -3 });

    expect(a).toMatchObject({ largura: null, altura: null, folhas_sugeridas: null, medido: false });
  });

  it('aceita medida que veio como string numérica do jsonb', () => {
    const a = normalizarAmbiente({ name: 'Sala', largura: '2.25', altura: '1.75' });

    expect(a).toMatchObject({ largura: 2.25, altura: 1.75, medido: true });
  });

  it('ignora ambiente sem nome — não dá para parear com item nenhum', () => {
    expect(normalizarAmbiente({ name: '   ', largura: 2 })).toBeNull();
    expect(normalizarAmbiente({ largura: 2 })).toBeNull();
    expect(normalizarAmbiente(null)).toBeNull();
    expect(normalizarAmbiente('sacada')).toBeNull();
  });

  it('preserva URL absoluta de foto e descarta entrada inválida', () => {
    const a = normalizarAmbiente({
      name: 'Sala',
      photos: ['https://cdn.exemplo.com/a.jpg', '/uploads/b.jpg', '', null, 42],
    });

    expect(a?.fotos).toEqual([
      'https://cdn.exemplo.com/a.jpg',
      'https://agenda.texhaus.com.br/uploads/b.jpg',
    ]);
  });

  it('trata ausência de fotos sem quebrar', () => {
    expect(normalizarAmbiente({ name: 'Sala' })?.fotos).toEqual([]);
    expect(normalizarAmbiente({ name: 'Sala', photos: 'nao-e-array' })?.fotos).toEqual([]);
  });

  it('lê a marcação de o que vai no ambiente', () => {
    expect(normalizarAmbiente({ name: 'Sala', tipo_produto: 'cortina', trilho_especial: true }))
      .toMatchObject({ tipo_produto: 'cortina', trilho_especial: true });
    expect(normalizarAmbiente({ name: 'Sala', tipo_produto: 'persiana' }))
      .toMatchObject({ tipo_produto: 'persiana', trilho_especial: false });
  });

  it('ignora tipo desconhecido e trilho fora de cortina', () => {
    expect(normalizarAmbiente({ name: 'Sala', tipo_produto: 'toldo' })?.tipo_produto).toBeNull();
    // trilho especial só existe acompanhando cortina
    expect(normalizarAmbiente({ name: 'Sala', tipo_produto: 'persiana', trilho_especial: true })?.trilho_especial).toBe(false);
  });

  it('registro antigo vem sem marcação, para o vendedor decidir', () => {
    expect(normalizarAmbiente({ name: 'Sacada', info: '2.25 x 1.75' }))
      .toMatchObject({ tipo_produto: null, trilho_especial: false });
  });
});
