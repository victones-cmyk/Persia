import { describe, it, expect } from 'vitest';
import { consolidarAmbientesMedidos } from './consolidacaoMedicao';

const amb = (nome: string, largura: number | null, altura: number | null, medido = true) =>
  ({ nome, largura, altura, medido });

describe('consolidarAmbientesMedidos', () => {
  it('soma as faces medidas com o mesmo nome na mesma OS', () => {
    // Caso real da OS 832: "Sacada ( teto )" aparece duas vezes, 2,40 e 0,30.
    // São a frente e a lateral — antes, a segunda apagava a primeira.
    const r = consolidarAmbientesMedidos([
      { appointment_id: 832, ambientes: [amb('Sacada ( teto )', 2.4, 2.48), amb('Sacada ( teto )', 0.3, 2.48)] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nome: 'Sacada ( teto )', largura: 2.7, altura: 2.48, faces: 2 });
  });

  it('faces com alturas diferentes não viram uma altura só', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Sacada', 2.32, 2.55), amb('Sacada', 1.1, 1.78)] },
    ]);
    expect(r[0].largura).toBe(3.42);
    expect(r[0].altura).toBeNull();
    expect(r[0].faces).toBe(2);
  });

  it('ambiente medido uma vez só tem uma face', () => {
    const r = consolidarAmbientesMedidos([{ appointment_id: 1, ambientes: [amb('Sala', 3, 2.5)] }]);
    expect(r[0].faces).toBe(1);
  });

  it('OS posterior substitui a anterior — é remedição, não face nova', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Sala', 3, 2.5)] },
      { appointment_id: 2, ambientes: [amb('Sala', 3.2, 2.5)] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].largura).toBe(3.2); // não 6,2
    expect(r[0].faces).toBe(1);
  });

  it('remedição em partes substitui a medição inteira anterior', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Sacada', 2.7, 2.48)] },
      { appointment_id: 2, ambientes: [amb('Sacada', 2.4, 2.48), amb('Sacada', 0.35, 2.48)] },
    ]);
    expect(r[0].largura).toBe(2.75);
    expect(r[0].faces).toBe(2);
  });

  it('ignora ambiente sem medida estruturada', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Sala', null, null, false), amb('Quarto', 2, 2.4)] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe('Quarto');
  });

  it('parea nome tolerando acento, caixa e espaço repetido', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Área  de Serviço', 1, 2), amb('area de servico', 0.5, 2)] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].largura).toBe(1.5);
    // Guarda o nome como o técnico escreveu da primeira vez.
    expect(r[0].nome).toBe('Área  de Serviço');
  });

  it('ambiente sem nome não entra', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('   ', 2, 2), amb('Sala', 1, 2)] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe('Sala');
  });

  it('sem eventos, sem ambientes', () => {
    expect(consolidarAmbientesMedidos([])).toEqual([]);
  });
});
