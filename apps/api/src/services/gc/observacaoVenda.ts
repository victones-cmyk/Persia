// apps/api/src/services/gc/observacaoVenda.ts
// Grava a observação interna de uma venda já existente no GestãoClick.
//
// PERIGOSO POR NATUREZA, e por isso o cuidado aqui é desproporcional ao tamanho
// da tarefa: o GC não tem PATCH, só `PUT /vendas/{id}`, que exige o registro
// inteiro. Um PUT malformado numa venda JÁ PAGA pode derrubar produtos ou
// parcelas — dano em dinheiro de cliente, não em dado de teste.
//
// Três defesas, nesta ordem:
//
// 1. Ida e volta fiel. O que vai no PUT é exatamente o que o GET devolveu, com
//    UM campo alterado. Nada é remontado à mão, porque cada campo remontado é
//    uma chance de esquecer um.
// 2. Confere antes de escrever. Sem produtos ou sem total no GET, aborta: ou a
//    resposta veio incompleta, ou não é o que se espera de uma venda.
// 3. Confere depois de escrever. Relê a venda e compara quantidade de produtos,
//    de pagamentos e valor total. Não desfaz nada — mas transforma uma corrupção
//    silenciosa num erro gritado no log, que é a diferença entre descobrir hoje
//    e descobrir no fechamento do mês.

import { gcRequest } from './client';

export interface ResultadoObservacao {
  ok: boolean;
  /** Por que não deu, quando não deu. */
  motivo?: string;
}

interface VendaGc {
  id?: unknown;
  hash?: unknown;
  produtos?: unknown;
  pagamentos?: unknown;
  valor_total?: unknown;
  observacoes_interna?: unknown;
  [k: string]: unknown;
}

const tamanho = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Assinatura do que NÃO pode mudar por causa de uma observação. */
const intacto = (v: VendaGc): string =>
  `${tamanho(v.produtos)}|${tamanho(v.pagamentos)}|${String(v.valor_total ?? '')}`;

async function lerVenda(id: string): Promise<VendaGc | null> {
  const r = await gcRequest<{ data?: unknown } | null>({ method: 'GET', url: `/vendas/${id}` });
  const v = (r && typeof r === 'object' && 'data' in r ? r.data : r) as VendaGc | null;
  return v && typeof v === 'object' ? v : null;
}

/**
 * Escreve `texto` na observação interna da venda, preservando o resto.
 *
 * Melhor esforço: devolve o que houve em vez de lançar. Quem chama está no meio
 * de uma venda ou de uma absorção que já aconteceu — falhar em anotar não pode
 * derrubar a operação que já se completou.
 */
export async function gravarObservacaoInternaVenda(
  gcVendaId: string,
  texto: string,
): Promise<ResultadoObservacao> {
  try {
    const antes = await lerVenda(gcVendaId);
    if (!antes) return { ok: false, motivo: 'venda não encontrada no GestãoClick' };

    // Uma venda sem produtos e sem total não é uma venda: provavelmente a
    // resposta veio truncada. Escrever em cima disso é o cenário exato que
    // apagaria os itens.
    if (tamanho(antes.produtos) === 0 && !antes.valor_total) {
      return { ok: false, motivo: 'resposta do GestãoClick sem produtos nem total — não é seguro reescrever' };
    }

    const referencia = intacto(antes);

    const payload: VendaGc = { ...antes, observacoes_interna: texto };
    // id e hash identificam o registro e vão na URL; reenviá-los no corpo não
    // acrescenta nada e alguns endpoints do GC reclamam.
    delete payload.id;
    delete payload.hash;

    await gcRequest({ method: 'PUT', url: `/vendas/${gcVendaId}`, data: payload });

    const depois = await lerVenda(gcVendaId);
    if (!depois) return { ok: false, motivo: 'não foi possível reler a venda para conferir' };
    if (intacto(depois) !== referencia) {
      // Não dá para desfazer daqui — mas isto tem que aparecer.
      return {
        ok: false,
        motivo: `ALERTA: a venda ${gcVendaId} mudou além da observação (antes ${referencia}, depois ${intacto(depois)}). Conferir no GestãoClick.`,
      };
    }
    if (String(depois.observacoes_interna ?? '') !== texto) {
      return { ok: false, motivo: 'o GestãoClick aceitou o PUT mas não guardou a observação' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
