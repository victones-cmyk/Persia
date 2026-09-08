// apps/api/src/services/agenda/consolidacaoMedicao.ts
// Reduz os ambientes de várias OS a uma medida por ambiente.
//
// Duas coisas MUITO diferentes acontecem com nomes repetidos, e confundi-las
// perde medida:
//
// DENTRO DA MESMA OS, cada entrada é um ambiente por si. Nome repetido NÃO é
// motivo para somar: já custou caro. A OS 832 tem "Sacada ( teto )" duas vezes e
// eram mesmo duas faces do mesmo vão; a OS 846 tem "SALA ( sanca 15 cm )" e
// "Sala ( sanca 15 cm )" e eram duas janelas diferentes. O sinal é idêntico nos
// dois casos, e somar gerou 7,05 m — medida que não existia na casa da cliente.
//
// Quem sabe agrupar é gente: o pareamento na tela liga vários ambientes medidos
// à mesma peça quando for o caso. Aqui cada entrada sobrevive inteira, com o seu
// id, e nada é inventado.
//
// ENTRE OS DIFERENTES, nome repetido é REMEDIÇÃO: mediu, voltou num retorno e
// mediu de novo. Aí a última medição vale e a anterior não conta — somar seria
// dobrar o ambiente.

import { roundHalfUp } from '../calc/arredondamento';

/** Um ambiente como veio de uma OS. */
export interface AmbienteBruto {
  /** Id cunhado no aparelho — a identidade estável do ambiente. */
  id?: string | null;
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
   * Sempre 1 hoje: cada entrada do técnico vira uma linha.
   *
   * Mantido porque a comparação e a tela já leem este campo para avisar sobre
   * ambiente medido em partes — e o agrupamento agora vem do pareamento, que
   * sabe quantos ambientes caem na mesma peça.
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
function porEvento<T extends AmbienteBruto>(ambientes: T[]): Map<string, AmbienteConsolidado> {
  const saida = new Map<string, AmbienteConsolidado>();
  for (const amb of ambientes) {
    if (!amb.medido) continue;
    const nome = (amb.nome ?? '').trim();
    if (!nome) continue;
    // Chave é o ID, não o nome: dois ambientes do mesmo nome na mesma OS são
    // duas coisas distintas até alguém dizer o contrário. Sem id (registro
    // antigo), o nome serve de chave — aí o comportamento antigo permanece,
    // porque não há como distinguir mesmo.
    const k = amb.id?.trim() || `nome:${chave(nome)}`;
    saida.set(k, { id: amb.id ?? null, nome, largura: amb.largura, altura: amb.altura, medido: true, faces: 1 });
  }
  return saida;
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
    const doEvento = porEvento(ev.ambientes);

    // Remedição: o que esta OS mediu substitui o que uma OS ANTERIOR tinha
    // medido com o mesmo nome. É por nome porque cada OS cunha ids próprios — o
    // técnico que volta para remedir cria ambiente novo, não reusa o id.
    //
    // A limpeza acontece ANTES de inserir, e olhando só o que já estava lá: se
    // rodasse entrada a entrada, dois ambientes de mesmo nome DESTA OS se
    // apagariam um ao outro, que é justamente o que não pode acontecer.
    const nomesDaOs = new Set([...doEvento.values()].map((a) => chave(a.nome)));
    for (const [k, v] of final) {
      if (nomesDaOs.has(chave(v.nome))) final.delete(k);
    }
    for (const [k, amb] of doEvento) final.set(k, amb);
  }
  return [...final.values()];
}
