// apps/api/src/services/gc/limpezaProdutos.ts
// Inativação dos produtos SINTÉTICOS de um orçamento no GestãoClick.
// Cada envio cria produtos de uso único ("Cortina SALA Wave... #123", etc.) que,
// se ficarem ativos para sempre, poluem a busca do PDV. Quando o orçamento chega
// ao fim da vida útil (venda gerada/vinculada ou cancelamento), esses produtos
// são inativados — nunca excluídos, para preservar o histórico no GC.

import type { Orcamento, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { inativarProduto } from './produtos';

/** Chave gravada em resposta_gc no envio com os ids dos produtos CRIADOS pela Pérsia. */
export const CHAVE_PRODUTOS_CRIADOS = 'persia_produtos_criados';

/** Mescla a lista de produtos criados na resposta do GC salva em resposta_gc. */
export function respostaComProdutosCriados(resposta: unknown, criados: string[]): Record<string, unknown> {
  const base = resposta && typeof resposta === 'object' && !Array.isArray(resposta)
    ? resposta as Record<string, unknown>
    : { resposta };
  return { ...base, [CHAVE_PRODUTOS_CRIADOS]: criados };
}

type OrcamentoParaLimpeza = Pick<Orcamento, 'resposta_gc' | 'payload_gc_enviado' | 'itens_json'>;

function idsDeProdutosReais(itensJson: unknown): Set<string> {
  const ids = new Set<string>();
  if (!itensJson || typeof itensJson !== 'object' || Array.isArray(itensJson)) return ids;
  const obj = itensJson as { trilhos_especiais?: unknown; produtos_avulsos?: unknown };
  for (const lista of [obj.trilhos_especiais, obj.produtos_avulsos]) {
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      const id = String((item as { produto_id?: unknown })?.produto_id ?? '').trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Ids dos produtos sintéticos (criados pela Pérsia) de um orçamento enviado.
 * Preferência: lista explícita gravada no envio (resposta_gc.persia_produtos_criados).
 * Fallback (orçamentos anteriores a essa gravação): produtos do payload enviado,
 * menos os produtos REAIS do catálogo referenciados pelos itens extras
 * (produto avulso e trilho legado por produto), que jamais podem ser inativados.
 */
export function produtosSinteticosDoOrcamento(orc: OrcamentoParaLimpeza): string[] {
  const resposta = orc.resposta_gc;
  if (resposta && typeof resposta === 'object' && !Array.isArray(resposta)) {
    const explicitos = (resposta as Record<string, unknown>)[CHAVE_PRODUTOS_CRIADOS];
    if (Array.isArray(explicitos)) return explicitos.map(String).filter(Boolean);
  }

  const payload = orc.payload_gc_enviado;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const produtos = (payload as { produtos?: unknown }).produtos;
  if (!Array.isArray(produtos)) return [];
  const reais = idsDeProdutosReais(orc.itens_json);
  const ids = produtos
    .map((p) => String((p as { produto_id?: unknown })?.produto_id ?? '').trim())
    .filter((id) => id && !reais.has(id));
  return [...new Set(ids)];
}

/**
 * Inativa (best-effort) os produtos sintéticos do orçamento. Nunca lança:
 * a venda/cancelamento não pode falhar por causa da limpeza. Registra no log
 * de ações o que foi inativado e o que falhou.
 */
export async function inativarProdutosSinteticosDoOrcamento(
  prisma: PrismaClient,
  orc: Pick<Orcamento, 'id'> & OrcamentoParaLimpeza,
  usuarioId: string,
  contexto: 'venda_gerada' | 'venda_vinculada' | 'orcamento_cancelado',
): Promise<void> {
  const ids = produtosSinteticosDoOrcamento(orc);
  if (ids.length === 0) return;

  const inativados: string[] = [];
  const falhas: string[] = [];
  for (const id of ids) {
    try {
      await inativarProduto(id);
      inativados.push(id);
    } catch {
      falhas.push(id);
    }
  }

  // Reflete no catálogo local para a busca da Pérsia limpar sem esperar o sync.
  if (inativados.length > 0) {
    try {
      await prisma.gcProdutoLocal.updateMany({ where: { id: { in: inativados } }, data: { ativo: false } });
    } catch { /* sync posterior corrige */ }
  }

  try {
    await prisma.logAcao.create({
      data: {
        usuario_id: usuarioId,
        acao: 'produtos_sinteticos_inativados',
        detalhe: { orcamento_id: orc.id, contexto, inativados, falhas } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch { /* log é best-effort */ }
}
