// apps/api/src/services/agenda/agendaDb.ts
// Acesso ao banco do app Agenda (CurtainField), que roda no MESMO servidor
// Postgres da Pérsia, em outro database (`curtainfield`). Conexão dedicada com
// usuário restrito: SELECT em appointments/users e UPDATE apenas da coluna
// order_number — nunca lê fotos/pagamentos nem escreve outra coisa.
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
