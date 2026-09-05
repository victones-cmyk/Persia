// apps/api/src/controllers/agendaController.ts
// Vínculo entre orçamentos da Pérsia e OS (appointments) do app Agenda.
// Um pedido pode ter vários eventos (medição, instalação, retorno/garantia):
// a busca devolve todos e o vendedor escolhe quais vincular — o app nunca
// escolhe sozinho. Os dados exibidos vêm sempre ao vivo do Agenda; a Pérsia
// guarda só o id do vínculo.

import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { compararMedicao, temDivergencia, type ItemDoOrcamento } from '../services/calc/comparacaoMedicao';
import { recalcularComMedicao as recalcularItensComMedicao, type ItemComMedida } from '../services/calc/recalculoMedicao';
import { consolidarAmbientesMedidos } from '../services/agenda/consolidacaoMedicao';
import { agendaApiHabilitada, criarOsNoAgenda, listarTecnicosDoAgenda, sugerirDatasDeVisita, AgendaApiError, type AmbienteParaAgenda } from '../services/agenda/agendaApi';
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

/** GET /api/agenda/sugestoes?endereco= — quando marcar a visita. */
export async function sugerirDatas(req: Request, res: Response): Promise<void> {
  exigirVendedorOuAdmin(req);
  if (!agendaApiHabilitada()) {
    res.json({ sugestoes: [] });
    return;
  }
  try {
    res.json({ sugestoes: await sugerirDatasDeVisita(String(req.query.endereco ?? ''), 7) });
  } catch {
    // Sugestão é conveniência: falhar não pode impedir o agendamento manual.
    res.json({ sugestoes: [] });
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

  // Técnico e período deixam de ser opcionais: OS sem dono ou sem turno vira
  // trabalho de alguém depois, no outro app — que é o que a integração veio tirar.
  const tecnicoBruto = Number(b.tecnico_id);
  if (!Number.isInteger(tecnicoBruto) || tecnicoBruto <= 0) {
    throw new AppError(400, 'TECNICO_OBRIGATORIO', 'Escolha o técnico que fará a visita.');
  }
  const periodo = texto(b.periodo, 20);
  if (!['morning', 'afternoon', 'business_hours'].includes(periodo)) {
    throw new AppError(400, 'PERIODO_OBRIGATORIO', 'Escolha o período da visita.');
  }
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
      tecnico_id: tecnicoBruto,
      periodo,
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
 * GET /api/orcamentos/:id/ambientes — os ambientes que este orçamento já tem,
 * para o agendamento nascer preenchido. O vendedor digitou isso uma vez ao
 * montar o orçamento; pedir de novo é trabalho repetido e fonte de nome
 * divergente entre os dois lados.
 */
export async function listarAmbientesDoOrcamento(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  const entrada = (orc.entrada_json ?? null) as { itens?: unknown[]; cortinas?: unknown[] } | null;

  // Um ambiente pode ter persiana e cortina ao mesmo tempo; a lista sai com os
  // dois marcados, que é o que o técnico precisa saber para medir.
  const porNome = new Map<string, { nome: string; tipos: Set<'persiana' | 'cortina'>; largura: number | null; altura: number | null }>();
  const juntar = (lista: unknown[], tipo: 'persiana' | 'cortina') => {
    for (const bruto of lista) {
      const it = bruto as Record<string, unknown>;
      const nome = typeof it.ambiente === 'string' ? it.ambiente.trim() : '';
      if (!nome) continue;
      const chave = nome.toLowerCase();
      const g = porNome.get(chave) ?? { nome, tipos: new Set<'persiana' | 'cortina'>(), largura: 0, altura: null };
      g.tipos.add(tipo);
      // Largura acumula (as folhas somam o vão); altura vale a primeira vista.
      const l = Number(it.largura);
      if (Number.isFinite(l) && l > 0) g.largura = (g.largura ?? 0) + l;
      const a = Number(it.altura);
      if (g.altura === null && Number.isFinite(a) && a > 0) g.altura = a;
      porNome.set(chave, g);
    }
  };
  juntar(Array.isArray(entrada?.itens) ? entrada.itens : [], 'persiana');
  juntar(Array.isArray(entrada?.cortinas) ? entrada.cortinas : [], 'cortina');

  res.json({
    ambientes: [...porNome.values()].map((g) => ({
      nome: g.nome,
      tipos_produto: [...g.tipos],
      largura: g.largura ? Math.round(g.largura * 100) / 100 : null,
      altura: g.altura,
    })),
  });
}

/**
 * GET /api/orcamentos/:id/agenda/comparacao — o que foi orçado contra o que o
 * técnico mediu, ambiente a ambiente. É leitura: mostra a diferença e quem
 * decide o que fazer com ela é o vendedor.
 */
/**
 * Os ambientes medidos que valem para este orçamento.
 *
 * A ordem importa e é por CONCLUSÃO, não por data de agendamento: quem mediu
 * depois substitui quem mediu antes. Ordenar pelo agendamento fazia a medição
 * mais antiga ganhar quando um retorno era marcado para uma data anterior.
 *
 * O resto — faces do mesmo ambiente medidas em partes na mesma OS — é
 * responsabilidade de consolidarAmbientesMedidos.
 */
async function ambientesMedidosDoOrcamento(ids: number[]) {
  const eventos = await buscarAmbientesDosEventos(ids);
  const detalhes = await buscarEventosPorIds(ids);
  const concluidoEm = new Map(detalhes.map((e) => [e.id, e.concluido_em ? new Date(e.concluido_em).getTime() : 0]));
  const ordenados = [...eventos].sort(
    (a, b) => (concluidoEm.get(a.appointment_id) ?? 0) - (concluidoEm.get(b.appointment_id) ?? 0),
  );
  return consolidarAmbientesMedidos(ordenados);
}

/** Itens de entrada do orçamento, persianas e cortinas na mesma lista. */
function itensDaEntrada(entradaJson: unknown): ItemDoOrcamento[] {
  const entrada = (entradaJson ?? null) as { itens?: unknown[]; cortinas?: unknown[] } | null;
  return [
    ...(Array.isArray(entrada?.itens) ? entrada.itens : []),
    ...(Array.isArray(entrada?.cortinas) ? entrada.cortinas : []),
  ] as ItemDoOrcamento[];
}

export async function compararComMedicao(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  if (!agendaHabilitado()) {
    res.json({ habilitado: false, comparacao: [], divergente: false });
    return;
  }
  const medidos = await ambientesMedidosDoOrcamento(orc.agenda_vinculos.map((v) => v.agenda_appointment_id));

  const comparacao = compararMedicao(
    itensDaEntrada(orc.entrada_json),
    // `faces` vai junto: é o que avisa a tela quando a largura medida é a soma
    // de partes separadas em vez de um vão contínuo.
    medidos.map((a) => ({ nome: a.nome, largura: a.largura, altura: a.altura, medido: a.medido, faces: a.faces })),
  );
  res.json({ habilitado: true, comparacao, divergente: temDivergencia(comparacao) });
}

/**
 * GET /api/orcamentos/:id/agenda/medidas-itens — a medida do técnico traduzida
 * para os ITENS vendidos, um por item.
 *
 * A tela de Produção trabalha item a item (folha a folha) e a medição fala em
 * vão, então até aqui alguém tinha que abrir a OS no outro app e redigitar —
 * justamente o que este projeto vem eliminando em todo o resto do caminho.
 *
 * Usa itens_json, não entrada_json: em Produção o que vale é o que foi VENDIDO.
 * A repartição entre as folhas é a mesma do recálculo, então os dois caminhos não
 * podem divergir.
 */
export async function medidasDosItensPelaAgenda(req: Request, res: Response): Promise<void> {
  const orc = await carregarOrcamentoAutorizado(req);
  if (!agendaHabilitado()) {
    res.json({ habilitado: false, medidas: [], so_na_medicao: [] });
    return;
  }

  const snapshots = Array.isArray(orc.itens_json) ? (orc.itens_json as unknown[]) : [];
  if (snapshots.length === 0) {
    res.json({ habilitado: true, medidas: [], so_na_medicao: [] });
    return;
  }

  const medidos = await ambientesMedidosDoOrcamento(orc.agenda_vinculos.map((v) => v.agenda_appointment_id));
  if (medidos.length === 0) {
    res.json({ habilitado: true, medidas: [], so_na_medicao: [] });
    return;
  }

  // O snapshot guarda as medidas como largura_m/altura_m; o recálculo fala
  // largura/altura. Traduz na ida e na volta, preservando o índice, que é como a
  // Produção identifica cada item.
  const paraCalculo = snapshots.map((s) => {
    const it = (s ?? {}) as Record<string, unknown>;
    return {
      ambiente: typeof it.ambiente === 'string' ? it.ambiente : null,
      largura: Number(it.largura_m),
      altura: Number(it.altura_m),
    };
  });

  const r = recalcularItensComMedicao(
    paraCalculo as ItemComMedida[],
    medidos.map((a) => ({ nome: a.nome, largura: a.largura, altura: a.altura })),
  );

  // Devolve só os itens que de fato mudaram: preencher o resto seria reescrever
  // com o mesmo valor e sujar a conferência do que o técnico alterou.
  const ambientesMudados = new Set(r.mudancas.map((m) => m.ambiente.trim().toLowerCase()));
  const facesPorAmbiente = new Map(medidos.map((a) => [a.nome.trim().toLowerCase(), a.faces]));

  const medidas = r.itens
    .map((it, index) => ({ index, it, original: paraCalculo[index] }))
    .filter(({ it, original }) => {
      const amb = (original.ambiente ?? '').trim().toLowerCase();
      if (!ambientesMudados.has(amb)) return false;
      return it.largura !== original.largura || it.altura !== original.altura;
    })
    .map(({ index, it, original }) => ({
      index,
      ambiente: original.ambiente,
      largura: it.largura,
      altura: it.altura,
      largura_vendida: original.largura,
      altura_vendida: original.altura,
      faces_medidas: facesPorAmbiente.get((original.ambiente ?? '').trim().toLowerCase()) ?? 1,
    }));

  res.json({ habilitado: true, medidas, so_na_medicao: r.so_na_medicao });
}

/**
 * POST /api/orcamentos/:id/agenda/recalcular — refaz o orçamento com as medidas
 * do técnico.
 *
 * Nasce como RASCUNHO, não como venda. Recalcular mexe em preço, e a medida nova
 * não decide sozinha tudo o que o preço depende: transpasse, lado do comando,
 * instalação. O vendedor abre, confere folha a folha e envia — e é só no envio
 * que o orçamento antigo vira "Substituído" no GestãoClick, para nada ficar
 * marcado como substituído por algo que não chegou a existir.
 *
 * O antigo não é apagado nem cancelado: continua lá, e o novo aponta para ele.
 * Era isso que o cliente pediu ao falar em backtrack — poder olhar depois e
 * entender por que o valor mudou.
 */
export async function recalcularComMedicao(req: Request, res: Response): Promise<void> {
  exigirAgenda();
  const sessao = req.session.usuario!;
  const orc = await carregarOrcamentoAutorizado(req);

  // Vendido não se recalcula. Marcar o antigo como "Substituído" muda a situação
  // do ORÇAMENTO e não desfaz a VENDA: enviar o recalculado deixaria duas vendas
  // de pé para o mesmo cliente, que é o banco torto que este fluxo todo existe
  // para evitar. Depois da venda, quem trata diferença de medida é a Produção,
  // que ajusta sem duplicar. A tela já esconde o botão; isto é a trava de verdade.
  if (orc.gc_pedido_id || orc.gc_pedido_codigo) {
    throw new AppError(
      409,
      'ORCAMENTO_JA_VENDIDO',
      'Este orçamento já virou venda e não pode ser recalculado — sairia uma segunda venda no GestãoClick. Diferença de medida em venda já fechada se resolve na tela de Produção.',
    );
  }

  const entrada = (orc.entrada_json ?? null) as { itens?: unknown[]; cortinas?: unknown[] } | null;
  if (!entrada) {
    throw new AppError(400, 'SEM_ENTRADA', 'Este orçamento é antigo demais para ser recalculado: não guardamos os dados do formulário. Duplique-o e refaça com as medidas do técnico.');
  }

  const medidos = await ambientesMedidosDoOrcamento(orc.agenda_vinculos.map((v) => v.agenda_appointment_id));
  if (medidos.length === 0) {
    throw new AppError(400, 'SEM_MEDICAO', 'Nenhuma OS vinculada tem medição concluída.');
  }

  // Persianas e cortinas moram em listas separadas, mas o ambiente atravessa as
  // duas (a mesma parede pode ter as duas coisas): recalcula junto e devolve
  // cada item para a lista de onde veio.
  const itens = Array.isArray(entrada.itens) ? entrada.itens : [];
  const cortinas = Array.isArray(entrada.cortinas) ? entrada.cortinas : [];
  const resultado = recalcularItensComMedicao(
    [...itens, ...cortinas] as ItemComMedida[],
    medidos.map((a) => ({ nome: a.nome, largura: a.largura, altura: a.altura })),
  );

  if (resultado.mudancas.length === 0) {
    throw new AppError(400, 'SEM_DIFERENCA', 'As medidas do técnico já são as que estão no orçamento — não há o que recalcular.');
  }

  const novaEntrada: Record<string, unknown> = { ...entrada };
  if (Array.isArray(entrada.itens)) novaEntrada.itens = resultado.itens.slice(0, itens.length);
  if (Array.isArray(entrada.cortinas)) novaEntrada.cortinas = resultado.itens.slice(itens.length);

  // Rascunho ainda não foi a lugar nenhum: corrige no próprio registro. Criar uma
  // cópia aqui só encheria a lista de dois rascunhos quase iguais, e não há
  // orçamento no GC para marcar como substituído. É o caso mais comum, aliás — a
  // medição costuma voltar antes de o orçamento ser fechado.
  if (orc.status === 'rascunho') {
    // itens_json fica como está, mesmo sendo o cálculo das medidas antigas. É
    // rascunho: o preço aí sempre foi provisório e é refeito no salvar/enviar.
    // Apagá-lo deixaria a tela do orçamento sem item nenhum, que lê como dado
    // perdido — susto pior que um valor provisório desatualizado por alguns
    // minutos, já que daqui o vendedor vai direto para a calculadora.
    const atualizado = await prisma.orcamento.update({
      where: { id: orc.id },
      data: { entrada_json: novaEntrada as Prisma.InputJsonValue },
    });
    await prisma.logAcao.create({
      data: {
        usuario_id: sessao.id,
        acao: 'orcamento_recalculado_medicao',
        detalhe: {
          orcamento_id: orc.id,
          no_lugar: true,
          ambientes: resultado.mudancas.map((m) => m.ambiente),
          so_na_medicao: resultado.so_na_medicao,
        },
      },
    });
    res.json({
      orcamento: atualizado,
      mudancas: resultado.mudancas,
      so_na_medicao: resultado.so_na_medicao,
      no_lugar: true,
    });
    return;
  }

  const copia = await prisma.$transaction(async (tx) => {
    const nova = await tx.orcamento.create({
      data: {
        tipo_produto: orc.tipo_produto,
        usuario_id: orc.usuario_id,
        loja_id: orc.loja_id,
        status: 'rascunho',
        nome_cliente: orc.nome_cliente,
        gc_cliente_id: orc.gc_cliente_id,
        tecido_codigo_gc: orc.tecido_codigo_gc,
        tecido_nome: orc.tecido_nome,
        largura_m: orc.largura_m,
        altura_m: orc.altura_m,
        dimensao_m: orc.dimensao_m,
        tc_m: orc.tc_m,
        acionamento: orc.acionamento,
        cor_acessorio: orc.cor_acessorio,
        rolamento: orc.rolamento,
        valor_bruto: orc.valor_bruto,
        valor_final: orc.valor_final,
        // Leva o itens_json do original, como "Duplicar" já faz: são as medidas
        // antigas, mas a cópia é rascunho e o preço é refeito no envio. Sem ele,
        // o novo orçamento apareceria sem item nenhum até o vendedor salvar, o
        // que lê como se a cópia tivesse dado errado.
        itens_json: orc.itens_json === null ? Prisma.DbNull : (orc.itens_json as Prisma.InputJsonValue),
        entrada_json: novaEntrada as Prisma.InputJsonValue,
        substitui_orcamento_id: orc.id,
      },
    });

    // Leva junto o vínculo com as OS: é a mesma obra, e sem isso o orçamento
    // novo apareceria como se nunca tivesse tido visita técnica.
    if (orc.agenda_vinculos.length > 0) {
      await tx.orcamentoAgendaVinculo.createMany({
        data: orc.agenda_vinculos.map((v) => ({
          orcamento_id: nova.id,
          agenda_appointment_id: v.agenda_appointment_id,
          tipo: v.tipo,
          criado_por: sessao.id,
        })),
        skipDuplicates: true,
      });
    }
    return nova;
  });

  await prisma.logAcao.create({
    data: {
      usuario_id: sessao.id,
      acao: 'orcamento_recalculado_medicao',
      detalhe: {
        origem_id: orc.id,
        copia_id: copia.id,
        ambientes: resultado.mudancas.map((m) => m.ambiente),
        so_na_medicao: resultado.so_na_medicao,
      },
    },
  });

  res.status(201).json({
    orcamento: copia,
    mudancas: resultado.mudancas,
    so_na_medicao: resultado.so_na_medicao,
    no_lugar: false,
  });
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
