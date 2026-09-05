// apps/api/src/controllers/agendaController.ts
// Vínculo entre orçamentos da Pérsia e OS (appointments) do app Agenda.
// Um pedido pode ter vários eventos (medição, instalação, retorno/garantia):
// a busca devolve todos e o vendedor escolhe quais vincular — o app nunca
// escolhe sozinho. Os dados exibidos vêm sempre ao vivo do Agenda; a Pérsia
// guarda só o id do vínculo.

import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { compararMedicao, temDivergencia, type ItemDoOrcamento } from '../services/calc/comparacaoMedicao';
import { agendaApiHabilitada, criarOsNoAgenda, listarTecnicosDoAgenda, AgendaApiError, type AmbienteParaAgenda } from '../services/agenda/agendaApi';
import {
  agendaHabilitado,
  buscarAmbientesDosEventos,
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
 * GET /api/orcamentos/:id/agenda/ambientes — ambientes medidos nas OS vinculadas
 * a este orçamento. É daqui que sai a medida do técnico para montar/conferir o
 * orçamento, em vez de alguém reabrir a OS no outro app e redigitar.
 */
export async function listarAmbientesAgenda(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  if (!agendaHabilitado()) {
    res.json({ habilitado: false, eventos: [] });
    return;
  }
  const ids = orc.agenda_vinculos.map((v) => v.agenda_appointment_id);
  const eventos = await buscarAmbientesDosEventos(ids);
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
  const termoOs = String(req.query.os ?? '').trim();

  // Busca direta pelo número da OS: resolve os casos em que o nome no Agenda é
  // de outra pessoa (parente, quem recebe o técnico no local) e não bate com o
  // cliente do orçamento.
  if (termoOs) {
    const id = Number(termoOs);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'OS_INVALIDA', 'Informe um número de OS válido.');
    }
    res.json({ modo: 'os', eventos: await buscarEventosPorIds([id]) });
    return;
  }

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

/** Medição é assunto de admin/vendedor; revenda não monta orçamento a partir de OS. */
function exigirVendedorOuAdmin(req: Request): void {
  if (req.session.usuario!.perfil === 'revenda') {
    throw new AppError(403, 'ACESSO_NEGADO', 'Não disponível para o perfil revenda.');
  }
}

/**
 * GET /api/agenda/eventos/buscar?cliente=|os= — busca de OS SEM orçamento no meio.
 * Existe porque o vendedor pode partir da medição: quando a visita técnica veio
 * antes da venda, não há orçamento ainda a que escopar a busca.
 */
export async function buscarEventosAgendaAvulso(req: Request, res: Response): Promise<void> {
  exigirAgenda();
  exigirVendedorOuAdmin(req);
  const termoOs = String(req.query.os ?? '').trim();
  const termoCliente = String(req.query.cliente ?? '').trim();

  if (termoOs) {
    const id = Number(termoOs);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'OS_INVALIDA', 'Informe um número de OS válido.');
    }
    res.json({ modo: 'os', eventos: await buscarEventosPorIds([id]) });
    return;
  }
  if (termoCliente.length < 3) {
    throw new AppError(400, 'BUSCA_CURTA', 'Informe ao menos 3 letras do nome do cliente.');
  }
  res.json({ modo: 'cliente', eventos: await buscarEventosPorCliente(termoCliente) });
}

/**
 * GET /api/agenda/eventos/:id/ambientes — ambientes medidos de uma OS específica,
 * para montar o orçamento a partir dela antes de o vínculo existir.
 */
export async function listarAmbientesDeEvento(req: Request, res: Response): Promise<void> {
  exigirAgenda();
  exigirVendedorOuAdmin(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'OS_INVALIDA', 'Informe um número de OS válido.');
  }
  const [evento] = await buscarEventosPorIds([id]);
  if (!evento) throw new AppError(404, 'NAO_ENCONTRADO', 'OS não encontrada no Agenda.');
  const [ambientes] = await buscarAmbientesDosEventos([id]);
  res.json({ evento, ambientes: ambientes?.ambientes ?? [] });
}

/** GET /api/agenda/tecnicos — quem pode receber a OS, para o vendedor já atribuir. */
export async function listarTecnicosAgenda(req: Request, res: Response): Promise<void> {
  exigirVendedorOuAdmin(req);
  if (!agendaApiHabilitada()) {
    res.json({ habilitado: false, tecnicos: [] });
    return;
  }
  try {
    res.json({ habilitado: true, tecnicos: await listarTecnicosDoAgenda() });
  } catch {
    // Agenda fora do ar não pode impedir o resto da tela de funcionar; a lista
    // vem vazia e o agendamento segue possível sem atribuir técnico.
    res.json({ habilitado: true, tecnicos: [] });
  }
}

/**
 * POST /api/orcamentos/:id/agenda/agendar — cria a OS no Agenda a partir deste
 * orçamento e já a vincula. Fecha o caminho "vende primeiro, mede depois", em
 * que o vendedor abria o outro app e refazia o cadastro do cliente na mão.
 */
export async function agendarOsDoOrcamento(req: Request, res: Response): Promise<void> {
  exigirAgenda();
  exigirVendedorOuAdmin(req);
  const sessao = req.session.usuario!;
  const orc = await carregarOrcamentoAutorizado(req);
  if (!agendaApiHabilitada()) {
    throw new AppError(503, 'AGENDA_SEM_CHAVE', 'A criação de OS no Agenda não está configurada neste servidor.');
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const tipo = texto(b.tipo, 20);
  if (tipo !== 'measurement' && tipo !== 'installation') {
    throw new AppError(400, 'TIPO_INVALIDO', 'Escolha medição ou instalação.');
  }
  const clienteNome = texto(b.cliente_nome, 100) || orc.nome_cliente;
  if (!clienteNome || clienteNome === '(sem cliente)') {
    throw new AppError(400, 'CLIENTE_OBRIGATORIO', 'Informe o nome do cliente para agendar.');
  }

  const tecnicoBruto = Number(b.tecnico_id);
  const ambientes: AmbienteParaAgenda[] = (Array.isArray(b.ambientes) ? b.ambientes : [])
    .map((a) => {
      const amb = a as Record<string, unknown>;
      const nome = texto(amb.nome, 100);
      if (!nome) return null;
      const tipos = (Array.isArray(amb.tipos_produto) ? amb.tipos_produto : [])
        .filter((t): t is 'persiana' | 'cortina' => t === 'persiana' || t === 'cortina');
      return {
        // Id cunhado aqui: este ambiente nasce na Pérsia e o Agenda o respeita.
        id: randomUUID(),
        nome,
        observacao: texto(amb.observacao, 2000) || null,
        tipos_produto: tipos,
        trilho_especial: tipos.includes('cortina') && amb.trilho_especial === true,
      } as AmbienteParaAgenda;
    })
    .filter((a): a is AmbienteParaAgenda => a !== null);

  let os;
  try {
    os = await criarOsNoAgenda({
      tipo,
      tecnico_id: Number.isInteger(tecnicoBruto) && tecnicoBruto > 0 ? tecnicoBruto : null,
      cliente_nome: clienteNome,
      cliente_endereco: texto(b.cliente_endereco, 500) || null,
      cliente_telefone: texto(b.cliente_telefone, 20) || null,
      cliente_cep: texto(b.cliente_cep, 20) || null,
      cliente_numero: texto(b.cliente_numero, 20) || null,
      cliente_complemento: texto(b.cliente_complemento, 100) || null,
      vendedor: sessao.nome,
      pedido_codigo: orc.gc_pedido_codigo ?? orc.gc_codigo ?? null,
      agendado_para: texto(b.agendado_para, 40) || null,
      observacoes: texto(b.observacoes, 2000) || null,
      ambientes,
    });
  } catch (e) {
    const msg = e instanceof AgendaApiError ? e.message : 'Falha ao criar a OS no Agenda.';
    throw new AppError(502, 'AGENDA_FALHOU', msg);
  }

  // A OS existe lá; daqui em diante uma falha não deve desfazer isso — o vínculo
  // pode ser refeito pela tela, a OS não.
  await prisma.orcamentoAgendaVinculo.createMany({
    data: [{ orcamento_id: orc.id, agenda_appointment_id: os.id, tipo, criado_por: sessao.id }],
    skipDuplicates: true,
  });
  await prisma.logAcao.create({
    data: {
      usuario_id: sessao.id,
      acao: 'agenda_os_criada',
      detalhe: { orcamento_id: orc.id, appointment_id: os.id, tipo, ambientes: ambientes.length },
    },
  });

  res.status(201).json({ os });
}

/**
 * GET /api/orcamentos/:id/agenda/comparacao — o que foi orçado contra o que o
 * técnico mediu, ambiente a ambiente. É leitura: mostra a diferença e quem
 * decide o que fazer com ela é o vendedor.
 */
export async function compararComMedicao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  if (!agendaHabilitado()) {
    res.json({ habilitado: false, comparacao: [], divergente: false });
    return;
  }
  const ids = orc.agenda_vinculos.map((v) => v.agenda_appointment_id);
  const eventos = await buscarAmbientesDosEventos(ids);
  // Vários eventos podem trazer o mesmo ambiente (uma medição, depois um retorno
  // que remediu). Vale a medição CONCLUÍDA mais recente — não a última da lista,
  // que vinha ordenada por data de agendamento e podia ser a mais antiga a ter
  // sido de fato executada.
  const detalhes = await buscarEventosPorIds(ids);
  const concluidoEm = new Map(detalhes.map((e) => [e.id, e.concluido_em ? new Date(e.concluido_em).getTime() : 0]));
  const ordenados = [...eventos].sort(
    (a, b) => (concluidoEm.get(a.appointment_id) ?? 0) - (concluidoEm.get(b.appointment_id) ?? 0),
  );
  const porNome = new Map<string, (typeof eventos)[number]['ambientes'][number]>();
  for (const ev of ordenados) {
    for (const amb of ev.ambientes) {
      if (amb.medido) porNome.set(amb.nome.trim().toLowerCase(), amb);
    }
  }

  const entrada = (orc.entrada_json ?? null) as { itens?: unknown[]; cortinas?: unknown[] } | null;
  const itens = [
    ...(Array.isArray(entrada?.itens) ? entrada.itens : []),
    ...(Array.isArray(entrada?.cortinas) ? entrada.cortinas : []),
  ] as ItemDoOrcamento[];

  const comparacao = compararMedicao(
    itens,
    [...porNome.values()].map((a) => ({ nome: a.nome, largura: a.largura, altura: a.altura, medido: a.medido })),
  );
  res.json({ habilitado: true, comparacao, divergente: temDivergencia(comparacao) });
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
