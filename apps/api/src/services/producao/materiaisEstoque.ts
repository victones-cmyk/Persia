// apps/api/src/services/producao/materiaisEstoque.ts
// Agrega os componentes (materiais) das OS de um pedido em uma lista única
// pra dar saída no estoque do GestãoClick. Só entram OS cujos componentes
// TODOS tenham produto_id (hoje: cortina — persiana ainda não tem esse
// mapeamento, RN pendente). Uma OS com qualquer componente sem produto_id
// fica de fora inteira, não parcialmente, pra não deixar a peça com baixa
// incompleta.

import { roundHalfUp } from '../calc/arredondamento';
import type { ComponenteSnapshot, ItemProducaoSnapshot } from './documentos';

export interface MaterialConsumido {
  produto_id: string;
  nome: string;
  quantidade: number;
  unidade: string;
}

export interface OrdemParaBaixa {
  id: string;
  codigo: string;
  ambiente: string;
  produto: string;
  materiais: MaterialConsumido[];
}

export interface OrdemExcluidaBaixa {
  id: string;
  codigo: string;
  motivo: string;
}

export interface OrdemComItem {
  id: string;
  codigo: string;
  item_snapshot_json: unknown;
}

function nomeItem(item: ItemProducaoSnapshot): string {
  return item.nome_produto || item.tipo || 'Produto';
}

function componentesComQuantidade(item: ItemProducaoSnapshot): ComponenteSnapshot[] {
  return (item.componentes ?? []).filter((c) => Number(c.quantidade ?? 0) > 0);
}

/** Separa as OS de um pedido entre as que podem entrar na baixa (todo
 * componente mapeado a um produto do GC) e as que ficam de fora. */
export function classificarOrdensParaBaixa(ordens: OrdemComItem[]): {
  elegiveis: OrdemParaBaixa[];
  excluidas: OrdemExcluidaBaixa[];
} {
  const elegiveis: OrdemParaBaixa[] = [];
  const excluidas: OrdemExcluidaBaixa[] = [];

  for (const ordem of ordens) {
    const item = ordem.item_snapshot_json as ItemProducaoSnapshot;
    const componentes = componentesComQuantidade(item);
    if (componentes.length === 0) {
      excluidas.push({ id: ordem.id, codigo: ordem.codigo, motivo: 'Nenhum componente calculado para esta peça.' });
      continue;
    }
    const semMapeamento = componentes.find((c) => !c.produto_id);
    if (semMapeamento) {
      excluidas.push({
        id: ordem.id,
        codigo: ordem.codigo,
        motivo: `Componente "${semMapeamento.descricao ?? '-'}" ainda sem produto mapeado no GestãoClick.`,
      });
      continue;
    }
    elegiveis.push({
      id: ordem.id,
      codigo: ordem.codigo,
      ambiente: item.ambiente || '-',
      produto: nomeItem(item),
      materiais: componentes.map((c) => ({
        produto_id: c.produto_id as string,
        nome: c.descricao ?? (c.produto_id as string),
        quantidade: Number(c.quantidade),
        unidade: c.unidade ?? '-',
      })),
    });
  }

  return { elegiveis, excluidas };
}

/** Soma as quantidades do mesmo produto entre várias OS num único lançamento. */
export function agregarMateriais(elegiveis: OrdemParaBaixa[]): MaterialConsumido[] {
  const porProduto = new Map<string, MaterialConsumido>();
  for (const ordem of elegiveis) {
    for (const m of ordem.materiais) {
      const existente = porProduto.get(m.produto_id);
      if (existente) {
        existente.quantidade = roundHalfUp(existente.quantidade + m.quantidade, 4);
      } else {
        porProduto.set(m.produto_id, { ...m });
      }
    }
  }
  return Array.from(porProduto.values());
}

/** Texto de destino salvo no LogAcao — a única "observação" com o detalhe de
 * pra onde cada material foi, já que o GC não guarda isso na baixa via PUT. */
export function textoDestinoBaixa(pedidoCodigo: string, nomeCliente: string, elegiveis: OrdemParaBaixa[]): string {
  const linhas = elegiveis.map((o) => `OS ${o.codigo}: ${o.produto}${o.ambiente && o.ambiente !== '-' ? `, ambiente "${o.ambiente}"` : ''}`);
  return [`Pedido ${pedidoCodigo} - ${nomeCliente}`, ...linhas].join('\n');
}
