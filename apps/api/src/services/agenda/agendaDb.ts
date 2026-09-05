// apps/api/src/services/agenda/agendaDb.ts
// Acesso ao banco do app Agenda (CurtainField), que roda no MESMO servidor
// Postgres da Pérsia, em outro database (`curtainfield`). Conexão dedicada com
// usuário restrito: SELECT em appointments/users e UPDATE apenas da coluna
// order_number — nunca lê pagamentos nem escreve outra coisa.
//
// Lê também os AMBIENTES medidos (nome, medidas e fotos da medição), que são a
// base do orçamento: a medida do técnico entra na Pérsia por aqui em vez de ser
// redigitada. Fotos vêm como caminho relativo e são resolvidas contra
// AGENDA_BASE_URL para poderem ser exibidas.
//
// Sem AGENDA_DATABASE_URL configurada a integração fica desligada e os
// endpoints respondem "indisponível", sem derrubar o resto da Pérsia.

import { Pool } from 'pg';
import { env } from '../../config/env';

export type TipoEventoAgenda = 'measurement' | 'installation' | 'return' | 'warranty';

export interface EventoAgenda {
  id: number;
  tipo: TipoEventoAgenda | string;
  status: string;
  agendado_para: Date | null;
  concluido_em: Date | null;
  cliente_nome: string;
  cliente_endereco: string | null;
  cliente_telefone: string | null;
  pedido_codigo: string | null;
  instalador_nome: string | null;
  vendedor: string | null;
}

/**
 * Um ambiente medido pelo técnico. `id` é cunhado no aparelho dele e é a
 * identidade estável do ambiente dos dois lados — o nome é só rótulo e pode ser
 * corrigido sem quebrar o vínculo.
 *
 * Registros anteriores à medição estruturada não têm `id` nem medidas: neles a
 * medida foi digitada no texto livre (`observacao`), e é por isso que todos os
 * campos além do nome são opcionais.
 */
export interface AmbienteAgenda {
  id: string | null;
  nome: string;
  /**
   * O que vai neste ambiente, quando alguém marcou. Lista porque o cliente pode
   * querer os dois na mesma parede (blackout com cortina por cima). É SUGESTÃO:
   * o técnico nem sempre sabe, e quem decide é o vendedor ao montar o orçamento
   * — mesma divisão de papéis das folhas sugeridas.
   */
  tipos_produto: ('persiana' | 'cortina')[];
  trilho_especial: boolean;
  largura: number | null;
  altura: number | null;
  folhas_sugeridas: number | null;
  observacao: string | null;
  fotos: string[];
  /** Tem medida estruturada utilizável? Falso nos registros antigos. */
  medido: boolean;
}

export interface AmbientesDoEvento {
  appointment_id: number;
  ambientes: AmbienteAgenda[];
}

let pool: Pool | null = null;

export function agendaHabilitado(): boolean {
  return env.AGENDA_DATABASE_URL.trim() !== '';
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: env.AGENDA_DATABASE_URL, max: 3 });
    pool.on('error', (err) => console.error('[agenda] erro no pool de conexão:', err.message));
  }
  return pool;
}

const CAMPOS = `
  a.id,
  a.type AS tipo,
  a.status,
  a.scheduled_at AS agendado_para,
  a.completed_at AS concluido_em,
  a.client_name AS cliente_nome,
  a.client_address AS cliente_endereco,
  a.client_phone AS cliente_telefone,
  a.order_number AS pedido_codigo,
  u.name AS instalador_nome,
  a.seller AS vendedor
`;

async function consultar(sql: string, params: unknown[]): Promise<EventoAgenda[]> {
  const { rows } = await getPool().query<EventoAgenda>(sql, params);
  return rows;
}

/** Eventos do Agenda com o número de pedido informado (pode haver vários: medição, instalação, garantia). */
export function buscarEventosPorPedido(pedidoCodigo: string): Promise<EventoAgenda[]> {
  return consultar(
    `SELECT ${CAMPOS}
       FROM appointments a
       LEFT JOIN users u ON u.id = a.assigned_to
      WHERE btrim(a.order_number) = btrim($1)
      ORDER BY a.scheduled_at ASC`,
    [pedidoCodigo],
  );
}

/**
 * Busca por nome do cliente — usada quando o orçamento ainda não virou pedido
 * (ex.: medição feita antes da venda existir). Prioriza eventos SEM pedido
 * vinculado, que são justamente os candidatos a vincular.
 */
export function buscarEventosPorCliente(nomeCliente: string): Promise<EventoAgenda[]> {
  return consultar(
    `SELECT ${CAMPOS}
       FROM appointments a
       LEFT JOIN users u ON u.id = a.assigned_to
      WHERE a.client_name ILIKE $1
      ORDER BY (COALESCE(btrim(a.order_number), '') <> '') ASC, a.scheduled_at DESC
      LIMIT 20`,
    [`%${nomeCliente.trim()}%`],
  );
}

/** Eventos por id — usado para exibir os vínculos já salvos com dados sempre atuais. */
export function buscarEventosPorIds(ids: number[]): Promise<EventoAgenda[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return consultar(
    `SELECT ${CAMPOS}
       FROM appointments a
       LEFT JOIN users u ON u.id = a.assigned_to
      WHERE a.id = ANY($1::int[])
      ORDER BY a.scheduled_at ASC`,
    [ids],
  );
}

/** Número finito e positivo, ou null — o jsonb pode trazer string, null ou lixo. */
function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Caminho de foto do Agenda (`/uploads/...`) → URL absoluta exibível. */
function urlFoto(caminho: unknown): string | null {
  if (typeof caminho !== 'string' || caminho.trim() === '') return null;
  const c = caminho.trim();
  if (/^https?:\/\//i.test(c) || c.startsWith('data:')) return c;
  return env.AGENDA_BASE_URL.replace(/\/+$/, '') + '/' + c.replace(/^\/+/, '');
}

/** Exportada para teste: é aqui que os registros antigos e o jsonb solto viram forma conhecida. */
export function normalizarAmbiente(bruto: unknown): AmbienteAgenda | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const a = bruto as Record<string, unknown>;
  const nome = typeof a.name === 'string' ? a.name.trim() : '';
  if (!nome) return null;
  const largura = numeroOuNulo(a.largura);
  const altura = numeroOuNulo(a.altura);
  // Aceita a lista atual e o campo único da primeira versão, que ficou em
  // registros marcados antes de existir a marcação dupla.
  const brutos = Array.isArray(a.tipos_produto) ? a.tipos_produto : [a.tipo_produto];
  const tipos = [...new Set(
    brutos.filter((t): t is 'persiana' | 'cortina' => t === 'persiana' || t === 'cortina'),
  )];
  return {
    id: typeof a.id === 'string' && a.id.trim() !== '' ? a.id.trim() : null,
    nome,
    tipos_produto: tipos,
    trilho_especial: tipos.includes('cortina') && a.trilho_especial === true,
    largura,
    altura,
    folhas_sugeridas: numeroOuNulo(a.folhas_sugeridas),
    observacao: typeof a.info === 'string' && a.info.trim() !== '' ? a.info.trim() : null,
    fotos: Array.isArray(a.photos) ? a.photos.map(urlFoto).filter((u): u is string => u !== null) : [],
    // Só conta como medido quando as duas medidas vieram estruturadas; com uma
    // só não dá para montar item nenhum sem alguém completar a outra na mão.
    medido: largura !== null && altura !== null,
  };
}

/**
 * Ambientes medidos dos eventos informados. É a porta de entrada da medida do
 * técnico na Pérsia — usada para montar o orçamento a partir da medição e para
 * conferir, na produção, o que foi vendido contra o que foi medido.
 */
export async function buscarAmbientesDosEventos(ids: number[]): Promise<AmbientesDoEvento[]> {
  if (ids.length === 0) return [];
  const { rows } = await getPool().query<{ id: number; ambientes: unknown }>(
    `SELECT a.id, a.ambientes
       FROM appointments a
      WHERE a.id = ANY($1::int[])
      ORDER BY a.scheduled_at ASC`,
    [ids],
  );
  return rows.map((r) => ({
    appointment_id: r.id,
    ambientes: (Array.isArray(r.ambientes) ? r.ambientes : [])
      .map(normalizarAmbiente)
      .filter((a): a is AmbienteAgenda => a !== null),
  }));
}

/**
 * Grava o número do pedido no evento do Agenda (fecha o ciclo quando a OS
 * nasceu antes da venda existir). Só preenche quando ainda está vazio — nunca
 * sobrescreve um pedido já informado por lá.
 */
export async function vincularPedidoNoEvento(appointmentId: number, pedidoCodigo: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE appointments
        SET order_number = $2
      WHERE id = $1 AND COALESCE(btrim(order_number), '') = ''`,
    [appointmentId, pedidoCodigo],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Separa os eventos informados entre "visita já feita" e "visita marcada".
 * Recebe só os ids que a Pérsia realmente vinculou — em vez de varrer a agenda
 * inteira — porque o filtro da listagem parte dos vínculos, não do outro lado.
 */
export async function classificarEventosPorStatus(
  ids: number[],
): Promise<{ feitos: number[]; agendados: number[] }> {
  if (ids.length === 0) return { feitos: [], agendados: [] };
  const { rows } = await getPool().query<{ id: number; status: string }>(
    `SELECT a.id, a.status FROM appointments a WHERE a.id = ANY($1::int[])`,
    [ids],
  );
  const feitos: number[] = [];
  const agendados: number[] = [];
  for (const r of rows) {
    if (r.status === 'completed') feitos.push(r.id);
    // Cancelada não é visita pendente: some dos dois grupos em vez de virar
    // cobrança de uma visita que ninguém vai fazer.
    else if (r.status !== 'cancelled') agendados.push(r.id);
  }
  return { feitos, agendados };
}
