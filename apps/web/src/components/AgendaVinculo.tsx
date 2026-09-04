// apps/web/src/components/AgendaVinculo.tsx
// Vínculo do orçamento com as OS do app Agenda — substitui imprimir e grampear
// a OS em papel. Um pedido pode ter vários eventos (medição, instalação,
// garantia): a busca lista todos e o vendedor escolhe. Quando o orçamento ainda
// não virou pedido, cai na busca por nome do cliente.

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarPlus, faCalendarCheck, faHashtag, faMagnifyingGlass, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { AgendarOsModal } from './AgendarOsModal';

export interface EventoAgenda {
  id: number;
  tipo: string;
  status: string;
  agendado_para: string | null;
  concluido_em: string | null;
  cliente_nome: string;
  cliente_endereco: string | null;
  cliente_telefone: string | null;
  pedido_codigo: string | null;
  instalador_nome: string | null;
  vendedor: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  measurement: 'Medição',
  installation: 'Instalação',
  return: 'Retorno',
  warranty: 'Garantia',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada',
  in_transit: 'A caminho',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  waiting_client: 'Aguardando cliente',
  rescheduled: 'Reagendada',
  no_show: 'Cliente ausente',
  needs_return: 'Precisa retornar',
};

function rotuloTipo(v: string): string {
  return TIPO_LABEL[v] ?? v;
}

function rotuloStatus(v: string): string {
  return STATUS_LABEL[v] ?? v;
}

function classeStatus(status: string): string {
  if (status === 'completed') return 'badge-success';
  if (status === 'cancelled' || status === 'no_show') return 'badge-secondary';
  if (status === 'needs_return' || status === 'waiting_client') return 'badge-warning';
  return 'badge-info';
}

function dataHora(v: string | null): string {
  if (!v) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v));
}

function EventoLinha({ evento, acao }: { evento: EventoAgenda; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-neutral-200">
      <div style={{ minWidth: 0 }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="td-strong text-sm-ui">{rotuloTipo(evento.tipo)}</span>
          <span className={`badge ${classeStatus(evento.status)}`}>
            {rotuloStatus(evento.status)}
          </span>
          <span className="text-xs-ui text-neutral-500 font-mono">OS #{evento.id}</span>
        </div>
        <div className="text-xs-ui text-neutral-600 mt-1" style={{ overflowWrap: 'anywhere' }}>
          {dataHora(evento.agendado_para)}
          {evento.instalador_nome ? ` · ${evento.instalador_nome}` : ''}
          {evento.pedido_codigo ? ` · pedido ${evento.pedido_codigo}` : ' · sem pedido no Agenda'}
        </div>
        <div className="text-xs-ui text-neutral-500" style={{ overflowWrap: 'anywhere' }}>
          {evento.cliente_nome}{evento.cliente_endereco ? ` — ${evento.cliente_endereco}` : ''}
        </div>
      </div>
      {acao}
    </div>
  );
}

export function AgendaVinculo({ orcamentoId, nomeCliente, gcClienteId }: { orcamentoId: string; nomeCliente: string; gcClienteId?: string | null }) {
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [vinculados, setVinculados] = useState<EventoAgenda[]>([]);
  const [habilitado, setHabilitado] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [candidatos, setCandidatos] = useState<EventoAgenda[] | null>(null);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [termoCliente, setTermoCliente] = useState('');
  const [termoOs, setTermoOs] = useState('');
  // Busca manual aberta: por nome do cliente ou pelo número da OS. Esta última
  // resolve os casos em que a OS está no nome de outra pessoa (parente, quem
  // recebe o técnico), que nunca bateria com o cliente do orçamento.
  const [modoManual, setModoManual] = useState<'cliente' | 'os' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<{ habilitado: boolean; eventos: EventoAgenda[] }>(`/orcamentos/${orcamentoId}/agenda`);
      setHabilitado(r.habilitado);
      setVinculados(r.eventos);
    } catch {
      setHabilitado(false);
    } finally {
      setCarregando(false);
    }
  }, [orcamentoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function buscar(modo: 'pedido' | 'cliente' | 'os') {
    if (modo === 'os' && !termoOs.trim()) {
      setModoManual('os');
      return;
    }
    setBuscando(true);
    setErro(null);
    setAviso(null);
    try {
      const query = modo === 'cliente'
        ? `?cliente=${encodeURIComponent(termoCliente || nomeCliente)}`
        : modo === 'os'
          ? `?os=${encodeURIComponent(termoOs.trim())}`
          : '';
      const r = await api.get<{ eventos: EventoAgenda[]; sem_pedido?: boolean; sugestao_cliente?: string }>(
        `/orcamentos/${orcamentoId}/agenda/buscar${query}`,
      );
      const jaVinculados = new Set(vinculados.map((e) => e.id));
      const novos = r.eventos.filter((e) => !jaVinculados.has(e.id));
      setCandidatos(novos);
      setSelecionados(novos.map((e) => e.id));
      if (modo !== 'pedido') setModoManual(modo);
      if (r.sem_pedido) {
        // Orçamento ainda sem pedido: a busca útil é por nome ou número da OS.
        setTermoCliente(r.sugestao_cliente ?? nomeCliente);
        setModoManual('cliente');
        setAviso('Este orçamento ainda não tem número de pedido. Busque a OS pelo nome do cliente ou pelo número da OS.');
      } else if (novos.length === 0) {
        setAviso(
          modo === 'cliente' ? 'Nenhuma OS nova encontrada para esse cliente.'
            : modo === 'os' ? `Nenhuma OS nova encontrada com o número ${termoOs.trim()}.`
              : 'Nenhuma OS encontrada com esse número de pedido. Tente pelo nome do cliente ou pelo número da OS.',
        );
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao buscar OS no Agenda.');
    } finally {
      setBuscando(false);
    }
  }

  async function vincular() {
    if (selecionados.length === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await api.post<{ eventos: EventoAgenda[]; pedido_gravado_em: number[] }>(
        `/orcamentos/${orcamentoId}/agenda`,
        { appointment_ids: selecionados },
      );
      setVinculados(r.eventos);
      setCandidatos(null);
      setSelecionados([]);
      setAviso(r.pedido_gravado_em.length > 0
        ? `OS vinculada(s). O número do pedido foi gravado em ${r.pedido_gravado_em.length} OS do Agenda.`
        : 'OS vinculada(s) ao orçamento.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao vincular a OS.');
    } finally {
      setSalvando(false);
    }
  }

  async function desvincular(id: number) {
    setSalvando(true);
    setErro(null);
    try {
      const r = await api.del<{ eventos: EventoAgenda[] }>(`/orcamentos/${orcamentoId}/agenda/${id}`);
      setVinculados(r.eventos);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao desvincular a OS.');
    } finally {
      setSalvando(false);
    }
  }

  if (!habilitado && !carregando) return null;

  return (
    <div className="mb-4" style={{ border: '1px solid #dee2e6', borderRadius: 3, background: '#f8f9fa' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="text-sm-ui font-bold">
          <FontAwesomeIcon icon={faCalendarCheck} /> OS do Agenda
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-default btn-xs" disabled={buscando || carregando} onClick={() => void buscar('pedido')}>
            <FontAwesomeIcon icon={buscando ? faSpinner : faMagnifyingGlass} spin={buscando} /> Buscar pelo pedido
          </button>
          <button type="button" className="btn btn-default btn-xs" disabled={buscando || carregando} onClick={() => void buscar('cliente')}>
            <FontAwesomeIcon icon={faMagnifyingGlass} /> Buscar por cliente
          </button>
          <button type="button" className="btn btn-default btn-xs" disabled={buscando || carregando} onClick={() => void buscar('os')}>
            <FontAwesomeIcon icon={faHashtag} /> Buscar por nº da OS
          </button>
          <button type="button" className="btn btn-success btn-xs" disabled={carregando} onClick={() => setAgendarAberto(true)}>
            <FontAwesomeIcon icon={faCalendarPlus} /> Agendar visita
          </button>
        </div>
      </div>

      {erro && <div className="helper-error px-3 pb-2">{erro}</div>}
      {aviso && <div className="text-xs-ui text-neutral-600 px-3 pb-2">{aviso}</div>}

      {carregando ? (
        <div className="px-3 pb-3 text-sm-ui text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando…</div>
      ) : vinculados.length === 0 ? (
        <div className="px-3 pb-3 text-sm-ui text-neutral-500">Nenhuma OS vinculada a este orçamento.</div>
      ) : (
        <div style={{ background: '#fff' }}>
          {vinculados.map((evento) => (
            <EventoLinha
              key={evento.id}
              evento={evento}
              acao={(
                <button
                  type="button"
                  className="text-error hover:opacity-80 text-xs-ui"
                  disabled={salvando}
                  title="Desvincular esta OS"
                  onClick={() => void desvincular(evento.id)}
                >
                  <FontAwesomeIcon icon={faXmark} /> Desvincular
                </button>
              )}
            />
          ))}
        </div>
      )}

      {modoManual === 'cliente' && (
        <div className="flex flex-wrap items-end gap-2 px-3 pb-3">
          <div style={{ minWidth: 220, flex: '1 1 220px' }}>
            <label className="form-label" htmlFor={`agenda-cliente-${orcamentoId}`}>Nome do cliente no Agenda</label>
            <input
              id={`agenda-cliente-${orcamentoId}`}
              className="input"
              value={termoCliente}
              placeholder={nomeCliente}
              onChange={(e) => setTermoCliente(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscar('cliente'); }}
            />
          </div>
          <button type="button" className="btn btn-default btn-sm" disabled={buscando} onClick={() => void buscar('cliente')}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      )}

      {modoManual === 'os' && (
        <div className="flex flex-wrap items-end gap-2 px-3 pb-3">
          <div style={{ minWidth: 180, flex: '0 1 200px' }}>
            <label className="form-label" htmlFor={`agenda-os-${orcamentoId}`}>Nº da OS no Agenda</label>
            <input
              id={`agenda-os-${orcamentoId}`}
              className="input input-mono"
              value={termoOs}
              placeholder="Ex.: 561"
              inputMode="numeric"
              onChange={(e) => setTermoOs(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscar('os'); }}
            />
          </div>
          <button type="button" className="btn btn-default btn-sm" disabled={buscando || !termoOs.trim()} onClick={() => void buscar('os')}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
          <div className="helper-text" style={{ flexBasis: '100%' }}>
            Use quando a OS estiver no nome de outra pessoa (parente, quem recebe o técnico no local).
          </div>
        </div>
      )}

      {candidatos && candidatos.length > 0 && (
        <div className="mx-3 mb-3" style={{ border: '1px solid #dee2e6', borderRadius: 3, background: '#fff' }}>
          <div className="text-xs-ui font-bold px-3 py-2" style={{ background: '#f4f4f4', borderBottom: '1px solid #dee2e6' }}>
            {candidatos.length} OS encontrada(s) — selecione as que pertencem a este orçamento
          </div>
          {candidatos.map((evento) => (
            <EventoLinha
              key={evento.id}
              evento={evento}
              acao={(
                <input
                  type="checkbox"
                  checked={selecionados.includes(evento.id)}
                  aria-label={`Vincular OS ${evento.id}`}
                  onChange={() => setSelecionados((atuais) =>
                    atuais.includes(evento.id) ? atuais.filter((v) => v !== evento.id) : [...atuais, evento.id])}
                />
              )}
            />
          ))}
          <div className="flex justify-end gap-2 px-3 py-2 border-t border-neutral-200">
            <button type="button" className="btn btn-default btn-sm" disabled={salvando} onClick={() => setCandidatos(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-success btn-sm" disabled={salvando || selecionados.length === 0} onClick={() => void vincular()}>
              {salvando ? 'Vinculando…' : `Vincular ${selecionados.length} OS`}
            </button>
          </div>
        </div>
      )}
      <AgendarOsModal
        aberto={agendarAberto}
        orcamentoId={orcamentoId}
        nomeCliente={nomeCliente}
        gcClienteId={gcClienteId ?? null}
        onAgendado={() => { setAgendarAberto(false); void carregar(); }}
        onFechar={() => setAgendarAberto(false)}
      />
    </div>
  );
}
