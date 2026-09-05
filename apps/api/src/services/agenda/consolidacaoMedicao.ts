// apps/api/src/services/agenda/consolidacaoMedicao.ts
// Reduz os ambientes de várias OS a uma medida por ambiente.
//
// Duas coisas MUITO diferentes acontecem com nomes repetidos, e confundi-las
// perde medida:
//
// DENTRO DA MESMA OS, nome repetido são FACES do mesmo ambiente. É o que o
// técnico faz de verdade: a OS 832 da produção tem "Sacada ( teto )" duas vezes,
// 2,40 e 0,30 — a frente e a lateral. As duas existem, e o vão do ambiente é a
// soma. Antes daqui, a segunda simplesmente sobrescrevia a primeira e a face de
// 2,40 desaparecia da conferência sem ninguém notar.
//
// ENTRE OS DIFERENTES, nome repetido é REMEDIÇÃO: mediu, voltou num retorno e
// mediu de novo. Aí a última medição vale e a anterior não conta — somar seria
// dobrar o ambiente.

import { roundHalfUp } from '../calc/arredondamento';

/** Um ambiente como veio de uma OS. */
export interface AmbienteBruto {
  nome: string;
  largura: number | null;
  altura: number | null;
  medido: boolean;
}

export interface EventoComAmbientes<T extends AmbienteBruto> {
  appointment_id: number;
  ambientes: T[];
}

export interface AmbienteConsolidado extends AmbienteBruto {
  /**
   * Quantas entradas do técnico formaram esta medida. Acima de 1 significa que
   * o ambiente foi medido em partes — e aí a largura é a soma das faces, não um
   * vão contínuo, o que muda como o recálculo deve ser lido.
   */
  faces: number;
}

const chave = (nome: string): string =>
  nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Junta as faces de um ambiente medidas na mesma OS.
 *
 * A largura soma. A altura só sobrevive se todas as faces concordarem: faces com
 * alturas diferentes (a sacada de 2,48 e o trecho de 1,78) não têm uma altura só,
 * e inventar uma seria pior que admitir que não dá para dizer — a comparação já
 * sabe lidar com altura nula.
 */
function juntarFaces<T extends AmbienteBruto>(ambientes: T[]): Map<string, AmbienteConsolidado> {
  const porNome = new Map<string, AmbienteConsolidado>();
  for (const amb of ambientes) {
    if (!amb.medido) continue;
    const nome = (amb.nome ?? '').trim();
    if (!nome) continue;
    const k = chave(nome);
    const atual = porNome.get(k);
    if (!atual) {
      porNome.set(k, { nome, largura: amb.largura, altura: amb.altura, medido: true, faces: 1 });
      continue;
    }
    porNome.set(k, {
      nome: atual.nome,
      // Arredonda a cada soma: 2,40 + 0,30 em ponto flutuante dá 2,6999…
      largura: roundHalfUp((atual.largura ?? 0) + (amb.largura ?? 0)),
      altura: atual.altura !== null && amb.altura !== null && atual.altura === amb.altura ? atual.altura : null,
      medido: true,
      faces: atual.faces + 1,
    });
  }
  return porNome;
}

/**
 * A medida que vale para cada ambiente, a partir das OS vinculadas.
 *
 * `eventos` precisa vir ordenado da medição mais antiga para a mais recente:
 * quem vier depois substitui quem veio antes, porque é remedição.
 */
export function consolidarAmbientesMedidos<T extends AmbienteBruto>(
  eventos: EventoComAmbientes<T>[],
): AmbienteConsolidado[] {
  const final = new Map<string, AmbienteConsolidado>();
  for (const ev of eventos) {
    for (const [k, amb] of juntarFaces(ev.ambientes)) final.set(k, amb);
  }
  return [...final.values()];
}
