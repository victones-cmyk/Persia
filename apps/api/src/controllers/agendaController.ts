// apps/api/src/controllers/agendaController.ts
// Vínculo entre orçamentos da Pérsia e OS (appointments) do app Agenda.
// Um pedido pode ter vários eventos (medição, instalação, retorno/garantia):
// a busca devolve todos e o vendedor escolhe quais vincular — o app nunca
// escolhe sozinho. Os dados exibidos vêm sempre ao vivo do Agenda; a Pérsia
// guarda só o id do vínculo.

import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import {
  agendaHabilitado,
  buscarEventosPorCliente,
  buscarEventosPorIds,
  buscarEventosPorPedido,
  vincularPedidoNoEvento,
  type EventoAgenda,
} from '../services/agenda/agendaDb';

function exigirAgenda(): void {
  if (!agendaHabilitado()) {
    throw new AppError(503, 'AGENDA_INDISPONIVEL', 'A integração com o app Agenda não está configurada neste servidor.');
  }
}

async function carregarOrcamentoAutorizado(req: Request) {
  const sessao = req.session.usuario!;
  const orc = await prisma.orcamento.findUnique({
    where: { id: String(req.params.id) },
    include: { agenda_vinculos: true },
  });
  if (!orc || (sessao.perfil !== 'admin' && orc.usuario_id !== sessao.id)) {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.');
  }
  return orc;
}

/** GET /api/orcamentos/:id/agenda — vínculos atuais, com os dados vivos do Agenda. */
export async function listarVinculosAgenda(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  if (!agendaHabilitado()) {
    res.json({ habilitado: false, eventos: [] });
    return;
  }
  const ids = orc.agenda_vinculos.map((v) => v.agenda_appointment_id);
  // Um vínculo cujo evento sumiu do Agenda (excluído por lá) simplesmente não
  // aparece — a lista reflete o que existe hoje, não o histórico do vínculo.
  const eventos = await buscarEventosPorIds(ids);
  res.json({ habilitado: true, eventos });
}

/**
 * GET /api/orcamentos/agenda/vinculos?ids=a,b,c — vínculos de vários orçamentos
 * de uma vez, para a lista de Vendas exibir os atalhos de impressão sem fazer
 * uma requisição por linha.
 */
export async function listarVinculosAgendaEmLote(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const ids = String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  // A base do Agenda vai junto para o frontend montar o link de impressão sem
  // precisar de uma configuração própria.
  const base = { habilitado: agendaHabilitado(), agenda_base_url: env.AGENDA_BASE_URL };
  if (!base.habilitado || ids.length === 0) {
    res.json({ ...base, vinculos: {} });
    return;
  }

  const vinculos = await prisma.orcamentoAgendaVinculo.findMany({
    where: {
      orcamento_id: { in: ids },
      // Vendedor só enxerga os vínculos dos próprios orçamentos.
      ...(sessao.perfil === 'admin' ? {} : { orcamento: { usuario_id: sessao.id } }),
    },
    select: { orcamento_id: true, agenda_appointment_id: true },
  });
  if (vinculos.length === 0) {
    res.json({ ...base, vinculos: {} });
    return;
  }

  const eventos = await buscarEventosPorIds([...new Set(vinculos.map((v) => v.agenda_appointment_id))]);
  const porId = new Map(eventos.map((e) => [e.id, e]));
  const saida: Record<string, EventoAgenda[]> = {};
  for (const v of vinculos) {
    const evento = porId.get(v.agenda_appointment_id);
    if (!evento) continue; // evento apagado no Agenda: some da lista
    (saida[v.orcamento_id] ??= []).push(evento);
  }
  res.json({ ...base, vinculos: saida });
}

/**
 * GET /api/orcamentos/:id/agenda/buscar — procura eventos candidatos.
 * Sem `cliente` na query: busca pelo número do pedido do orçamento (caso comum).
 * Com `cliente=<termo>`: busca por nome, para quando a OS nasceu antes da venda.
 */
export async function buscarEventosAgenda(req: Request, res: Response): Promise<void> {
  exigirAgenda();
  const orc = await carregarOrcamentoAutorizado(req);
  const termoCliente = String(req.query.cliente ?? '').trim();

  if (termoCliente) {
    if (termoCliente.length < 3) {
      throw new AppError(400, 'BUSCA_CURTA', 'Informe ao menos 3 letras do nome do cliente.');
    }
    res.json({ modo: 'cliente', eventos: await buscarEventosPorCliente(termoCliente) });
    return;
  }

  const pedido = (orc.gc_pedido_codigo ?? '').trim();
  if (!pedido) {
    // Sem pedido ainda (ex.: medição antes da venda) — o frontend cai na busca
    // por cliente, já com o nome do orçamento como sugestão.
    res.json({ modo: 'pedido', eventos: [], sem_pedido: true, sugestao_cliente: orc.nome_cliente });
    return;
  }
  res.json({ modo: 'pedido', pedido, eventos: await buscarEventosPorPedido(pedido) });
}

function idsValidos(body: unknown): number[] {
  const raw = (body as { appointment_ids?: unknown } | null)?.appointment_ids;
  const ids = Array.isArray(raw) ? raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) throw new AppError(400, 'SEM_EVENTOS', 'Selecione ao menos uma OS do Agenda.');
  return [...new Set(ids)];
}

/** POST /api/orcamentos/:id/agenda — vincula uma ou mais OS do Agenda ao orçamento. */
export async function vincularEventosAgenda(req: Request, res: Response): Promise<void> {
  exigirAgenda();
  const sessao = req.session.usuario!;
  const orc = await carregarOrcamentoAutorizado(req);
  const ids = idsValidos(req.body);

  const eventos = await buscarEventosPorIds(ids);
  const encontrados = new Map(eventos.map((e) => [e.id, e]));
  const inexistentes = ids.filter((id) => !encontrados.has(id));
  if (inexistentes.length > 0) {
    throw new AppError(400, 'EVENTO_INVALIDO', `OS não encontrada no Agenda: ${inexistentes.join(', ')}.`);
  }

  await prisma.orcamentoAgendaVinculo.createMany({
    data: ids.map((id) => ({
      orcamento_id: orc.id,
      agenda_appointment_id: id,
      tipo: String(encontrados.get(id)?.tipo ?? ''),
      criado_por: sessao.id,
    })),
    skipDuplicates: true,
  });

  // Fecha o ciclo: se o orçamento já tem pedido e a OS do Agenda ainda está sem,
  // grava o número lá — assim a próxima busca por pedido já encontra sozinha.
  const pedido = (orc.gc_pedido_codigo ?? '').trim();
  const pedidoGravadoEm: number[] = [];
  if (pedido) {
    for (const id of ids) {
      const evento = encontrados.get(id);
      if (evento && !(evento.pedido_codigo ?? '').trim()) {
        try {
          if (await vincularPedidoNoEvento(id, pedido)) pedidoGravadoEm.push(id);
        } catch { /* vínculo na Pérsia já valeu; escrita no Agenda é complementar */ }
      }
    }
  }

  await prisma.logAcao.create({
    data: {
      usuario_id: sessao.id,
      acao: 'agenda_os_vinculada',
      detalhe: { orcamento_id: orc.id, appointment_ids: ids, pedido, pedido_gravado_em: pedidoGravadoEm },
    },
  });

  const atualizados = await buscarEventosPorIds(
    (await prisma.orcamentoAgendaVinculo.findMany({
      where: { orcamento_id: orc.id },
      select: { agenda_appointment_id: true },
    })).map((v) => v.agenda_appointment_id),
  );
  res.status(201).json({ eventos: atualizados, pedido_gravado_em: pedidoGravadoEm });
}

/** DELETE /api/orcamentos/:id/agenda/:appointmentId — desfaz um vínculo. */
export async function desvincularEventoAgenda(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const orc = await carregarOrcamentoAutorizado(req);
  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isInteger(appointmentId)) {
    throw new AppError(400, 'EVENTO_INVALIDO', 'OS inválida.');
  }

  const { count } = await prisma.orcamentoAgendaVinculo.deleteMany({
    where: { orcamento_id: orc.id, agenda_appointment_id: appointmentId },
  });
  if (count === 0) throw new AppError(404, 'VINCULO_NAO_ENCONTRADO', 'Este orçamento não está vinculado a essa OS.');

  await prisma.logAcao.create({
    data: {
      usuario_id: sessao.id,
      acao: 'agenda_os_desvinculada',
      detalhe: { orcamento_id: orc.id, appointment_id: appointmentId },
    },
  });

  // A escrita do pedido no Agenda NÃO é desfeita: o número do pedido continua
  // correto por lá independentemente de a Pérsia exibir o vínculo ou não.
  const restantes: EventoAgenda[] = agendaHabilitado()
    ? await buscarEventosPorIds(
        (await prisma.orcamentoAgendaVinculo.findMany({
          where: { orcamento_id: orc.id },
          select: { agenda_appointment_id: true },
        })).map((v) => v.agenda_appointment_id),
      )
    : [];
  res.json({ eventos: restantes });
}
