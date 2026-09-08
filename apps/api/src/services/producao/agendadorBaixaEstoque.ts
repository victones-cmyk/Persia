// apps/api/src/services/producao/agendadorBaixaEstoque.ts
// Dispara a baixa de estoque uma vez por dia, de madrugada.
//
// Por que automática e não um botão: o GestãoClick não expõe ajuste de estoque
// na API, então a baixa é ler o saldo do produto, subtrair e gravar de volta.
// Entre a leitura e a gravação, uma venda no PDV ou uma entrada de compra é
// silenciosamente sobrescrita. Rodando quando ninguém está lançando nada, essa
// janela fica sozinha — evita a colisão em vez de detectá-la depois.
//
// O relógio do servidor é UTC e continua sendo: o dia de corte é calculado em
// America/Sao_Paulo por Intl, como a sincronização do catálogo já fazia. Mudar
// o fuso da máquina afetaria logs, Postgres e os outros apps da VPS para não
// ganhar nada.
//
// Não agenda para um horário exato: verifica de tempos em tempos se já rodou no
// dia local e roda se ainda não. Isso sobrevive a restart, a deploy no meio da
// madrugada e a processo que ficou parado — um `setTimeout` para as 00:00 se
// perderia em qualquer um dos três.

import { prisma } from '../../lib/prisma';
import { executarBaixaDiariaEstoque } from '../../controllers/producaoController';

const CHAVE_ULTIMA = 'baixa_estoque_ultima_data';
const INTERVALO_MS = 15 * 60 * 1000;

/**
 * Antes desta hora (local) o dia é considerado "de madrugada".
 *
 * 5h dá folga para o processo subir, para a sincronização do catálogo terminar
 * antes, e para um deploy noturno — mas fecha bem antes de a loja abrir, que é
 * o que importa: depois disso já há gente lançando venda no PDV.
 */
export const HORA_LIMITE = 5;

let iniciado = false;

export function agoraSaoPaulo(d = new Date()): { data: string; hora: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { data: `${get('year')}-${get('month')}-${get('day')}`, hora: Number(get('hour')) };
}

/** Usuário que assina a baixa no log. Sem ninguém apertando botão, fica o admin. */
async function usuarioDoSistema(): Promise<string | null> {
  const u = await prisma.usuario.findFirst({
    where: { perfil: 'admin', ativo: true },
    orderBy: { criado_em: 'asc' },
    select: { id: true },
  });
  return u?.id ?? null;
}

export async function executarSeForHora(): Promise<void> {
  try {
    const { data: hoje, hora } = agoraSaoPaulo();
    if (hora >= HORA_LIMITE) return;

    const registro = await prisma.configuracao.findUnique({ where: { chave: CHAVE_ULTIMA } });
    if (registro?.valor === hoje) return; // já rodou hoje

    const usuarioId = await usuarioDoSistema();
    if (!usuarioId) {
      console.error('[baixa-estoque] nenhum admin ativo para assinar a baixa — pulando esta noite');
      return;
    }

    // Marca ANTES de executar. Se o processo cair no meio, a rotina não recomeça
    // do zero na próxima verificação: o que já foi debitado no GC não pode ser
    // debitado de novo, e a idempotência por material só protege dentro de um
    // mesmo pedido. O que ficou pendente aparece amanhã.
    await prisma.configuracao.upsert({
      where: { chave: CHAVE_ULTIMA },
      create: { chave: CHAVE_ULTIMA, valor: hoje, descricao: 'Último dia (São Paulo) em que a baixa de estoque automática rodou' },
      update: { valor: hoje },
    });

    const inicio = Date.now();
    const r = await executarBaixaDiariaEstoque(usuarioId);
    const seg = Math.round((Date.now() - inicio) / 1000);
    console.log(`[baixa-estoque] ${hoje}: ${r.pedidos} pedidos, ${r.materiais} materiais baixados, ${r.ignorados} ignorados, ${r.falhas} falhas (${seg}s)`);
  } catch (e) {
    console.error('[baixa-estoque] falha na rotina diária:', e);
  }
}

export function iniciarAgendadorBaixaEstoque(): void {
  if (iniciado) return;
  iniciado = true;
  setInterval(() => { void executarSeForHora(); }, INTERVALO_MS).unref();
  void executarSeForHora();
}
