// apps/api/src/lib/situacaoOrcamentoGc.ts
// Marca a situação do orçamento no GestãoClick — "Concretizado" quando vira
// venda, "Substituído" quando é refeito após remedição.
//
// A situação existe para dar rastro: olhando o GC, dá para saber o que aconteceu
// com cada orçamento sem precisar abrir a Pérsia. Mas é ACABAMENTO: se falhar, a
// venda continua válida e o orçamento continua certo. Por isso nada aqui
// propaga exceção — registra no log e segue, no mesmo espírito da inativação
// dos produtos sintéticos.

import type { Orcamento, PrismaClient } from '@prisma/client';
import { atualizarSituacaoOrcamento } from '../services/gc/orcamentos';

export type MotivoSituacao = 'venda_gerada' | 'substituido_por_remedicao';

/**
 * Aplica a situação no GC, em melhor esforço. Devolve se conseguiu, para quem
 * chamar decidir se conta ao usuário — mas ninguém precisa tratar erro.
 */
export async function marcarSituacaoOrcamentoGc(
  prisma: PrismaClient,
  orc: Pick<Orcamento, 'id' | 'gc_orcamento_id' | 'gc_codigo' | 'payload_gc_enviado'>,
  situacaoId: string,
  motivo: MotivoSituacao,
  usuarioId: string,
): Promise<boolean> {
  if (!orc.gc_orcamento_id) return false;
  try {
    const ok = await atualizarSituacaoOrcamento({
      gc_orcamento_id: orc.gc_orcamento_id,
      gc_codigo: orc.gc_codigo,
      situacao_id: situacaoId,
      payload_original: orc.payload_gc_enviado,
    });
    await prisma.logAcao.create({
      data: {
        usuario_id: usuarioId,
        acao: ok ? 'orcamento_situacao_gc_atualizada' : 'orcamento_situacao_gc_ignorada',
        detalhe: {
          orcamento_id: orc.id,
          gc_orcamento_id: orc.gc_orcamento_id,
          situacao_id: situacaoId,
          motivo,
          // Sem o payload original (registro antigo) não dá para montar o PUT,
          // que exige o orçamento inteiro.
          ...(ok ? {} : { razao: 'sem payload original ou sem código do orçamento' }),
        },
      },
    });
    return ok;
  } catch (e) {
    await prisma.logAcao.create({
      data: {
        usuario_id: usuarioId,
        acao: 'orcamento_situacao_gc_falhou',
        detalhe: {
          orcamento_id: orc.id,
          gc_orcamento_id: orc.gc_orcamento_id,
          situacao_id: situacaoId,
          motivo,
          erro: e instanceof Error ? e.message : String(e),
        },
      },
    }).catch(() => { /* nem o log pode derrubar a operação principal */ });
    return false;
  }
}
