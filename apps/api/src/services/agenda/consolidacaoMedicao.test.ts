import { describe, it, expect } from 'vitest';
import { consolidarAmbientesMedidos } from './consolidacaoMedicao';

let seq = 0;
const amb = (nome: string, largura: number | null, altura: number | null, medido = true) =>
  ({ id: `id-${++seq}`, nome, largura, altura, medido });

describe('consolidarAmbientesMedidos', () => {
  it('NÃO soma entradas de mesmo nome na mesma OS — elas podem ser vãos distintos', () => {
    // Caso real da OS 846: "SALA ( sanca 15 cm )" e "Sala ( sanca 15 cm )" são
    // duas JANELAS diferentes, e somá-las gerou 7,05 m — medida que não existe
    // na casa da cliente. Na OS 832 dois nomes iguais eram mesmo duas faces do
    // mesmo vão. O sinal é idêntico; só gente distingue. Aqui nada é somado.
    const r = consolidarAmbientesMedidos([
      { appointment_id: 846, ambientes: [amb('SALA ( sanca 15 cm )', 4.4, 2.64), amb('Sala ( sanca 15 cm )', 2.65, 2.63)] },
    ]);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.largura).sort()).toEqual([2.65, 4.4]);
  });

  it('cada entrada preserva o próprio id', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Sacada', 2.4, 2.48), amb('Sacada', 0.3, 2.48)] },
    ]);
    expect(r).toHaveLength(2);
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
  });

  it('registro antigo sem id continua sendo agrupado por nome', () => {
    // Sem id não há como distinguir — mantém o comportamento anterior em vez de
    // duplicar linhas em OS antigas.
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [
        { nome: 'Sacada', largura: 2.4, altura: 2.48, medido: true },
        { nome: 'Sacada', largura: 0.3, altura: 2.48, medido: true },
      ] },
    ]);
    expect(r).toHaveLength(1);
  });

  it('ambiente medido uma vez tem faces 1', () => {
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
    // A medição antiga sai; as duas novas ficam, cada uma na sua linha.
    expect(r.map((x) => x.largura).sort()).toEqual([0.35, 2.4]);
  });

  it('ignora ambiente sem medida estruturada', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Sala', null, null, false), amb('Quarto', 2, 2.4)] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe('Quarto');
  });

  it('nomes equivalentes na MESMA OS continuam separados', () => {
    const r = consolidarAmbientesMedidos([
      { appointment_id: 1, ambientes: [amb('Área  de Serviço', 1, 2), amb('area de servico', 0.5, 2)] },
    ]);
    expect(r).toHaveLength(2);
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
