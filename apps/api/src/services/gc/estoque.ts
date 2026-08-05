// apps/api/src/services/gc/estoque.ts
// Baixa de estoque de matéria-prima no GestãoClick.
//
// A API do GestãoClick NÃO tem um recurso de "Ajuste de Estoque" (conferido no
// blueprint completo em https://gestaoclick.docs.apiary.io/ — só existe
// /produtos, /vendas, /orcamentos, /compras etc, nada de estoque/ajuste/
// movimentação). A única alavanca é sobrescrever o campo "estoque" do produto
// via PUT /produtos/{id}. Por isso a baixa é: ler o estoque atual, subtrair o
// consumido, gravar de volta — sem gerar nenhum lançamento com observação no
// histórico do GC (esse detalhe fica só no nosso LogAcao).
//
// PUT aceita atualização parcial na prática: inativarProduto (produtos.ts) já
// manda só `{ ativo: '0' }` e funciona, apesar da doc listar nome/codigo_interno/
// valor_custo como "obrigatórios". Seguimos o mesmo padrão aqui.

import { gcRequest, type GcEnvelope } from './client';
import { roundHalfUp } from '../calc/arredondamento';

interface ProdutoGcBruto {
  id: string;
  nome: string;
  estoque?: number | string;
  possui_variacao?: string;
  movimenta_estoque?: string;
}

export interface EstoqueProduto {
  id: string;
  nome: string;
  estoque: number;
  possuiVariacao: boolean;
  movimentaEstoque: boolean;
}

export async function buscarEstoqueProduto(produtoId: string): Promise<EstoqueProduto> {
  const env = await gcRequest<GcEnvelope<ProdutoGcBruto>>({
    method: 'GET',
    url: `/api/produtos/${encodeURIComponent(produtoId)}`,
  });
  const p = env.data;
  if (!p) throw new Error(`Produto ${produtoId} não encontrado no GestãoClick.`);
  return {
    id: p.id,
    nome: p.nome,
    estoque: Number(p.estoque ?? 0),
    possuiVariacao: p.possui_variacao === '1',
    movimentaEstoque: p.movimenta_estoque !== '0',
  };
}

// Serializa o par GET+PUT por produto: a fila do gcRequest (client.ts) só
// garante 1 chamada HTTP por vez, não que um GET+PUT do mesmo produto fique
// "atômico" — sem isso, duas baixas do mesmo produto quase simultâneas (dois
// pedidos, dois usuários) podem ler o mesmo estoque de partida e uma
// sobrescrever a baixa da outra.
const filaPorProduto = new Map<string, Promise<unknown>>();

async function comLockProduto<T>(produtoId: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filaPorProduto.get(produtoId) ?? Promise.resolve();
  const vez = anterior.then(tarefa, tarefa);
  filaPorProduto.set(produtoId, vez.then(() => undefined, () => undefined));
  return vez;
}

export interface BaixaEstoqueResultado {
  produto_id: string;
  nome: string;
  estoque_antes: number;
  estoque_depois: number;
}

export class EstoqueVariacaoError extends Error {
  constructor(public produtoId: string, nome: string) {
    super(`"${nome}" tem variações cadastradas no GestãoClick — a baixa automática não suporta estoque por variação. Ajuste manualmente.`);
    this.name = 'EstoqueVariacaoError';
  }
}

/** Decrementa `quantidade` do estoque do produto e devolve antes/depois. */
export async function darSaidaEstoqueProduto(produtoId: string, quantidade: number): Promise<BaixaEstoqueResultado> {
  return comLockProduto(produtoId, async () => {
    const atual = await buscarEstoqueProduto(produtoId);
    if (atual.possuiVariacao) {
      throw new EstoqueVariacaoError(produtoId, atual.nome);
    }
    const estoque_depois = roundHalfUp(atual.estoque - quantidade, 4);
    await gcRequest({
      method: 'PUT',
      url: `/api/produtos/${encodeURIComponent(produtoId)}`,
      data: { estoque: estoque_depois },
    });
    return { produto_id: produtoId, nome: atual.nome, estoque_antes: atual.estoque, estoque_depois };
  });
}
