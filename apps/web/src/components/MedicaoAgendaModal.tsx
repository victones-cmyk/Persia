// apps/web/src/components/MedicaoAgendaModal.tsx
// Monta o orçamento a partir de uma medição da Agenda: o vendedor acha a OS,
// confere os ambientes medidos e diz em quantas folhas cada um vira. A Pérsia
// gera as linhas já divididas — ele ajusta largura, comando e rolamento depois.
//
// A divisão igual é ponto de partida, não palpite de precisão: transpasse varia
// caso a caso e quem decide é o vendedor. O ganho é ele não digitar as medidas
// nem fazer a conta.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faMagnifyingGlass, faRulerCombined, faImage } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { dividirLarguraEmFolhas } from '../lib/divisaoFolhas';
import { formatNum } from '../lib/formatacao';

interface EventoAgenda {
  id: number;
  tipo: string;
  status: string;
  agendado_para: string | null;
  cliente_nome: string;
  cliente_endereco: string | null;
  pedido_codigo: string | null;
}

interface AmbienteAgenda {
  id: string | null;
  nome: string;
  largura: number | null;
  altura: number | null;
  folhas_sugeridas: number | null;
  observacao: string | null;
  fotos: string[];
  medido: boolean;
}

export interface ItemGeradoMedicao {
  ambiente: string;
  largura: number;
  altura: number;
}

const rotuloTipo = (t: string) =>
  t === 'measurement' ? 'Medição' : t === 'installation' ? 'Instalação' : t === 'warranty' ? 'Garantia' : 'Retorno';

export function MedicaoAgendaModal({
  aberto,
  clienteSugerido,
  onGerar,
  onFechar,
}: {
  aberto: boolean;
  clienteSugerido?: string;
  onGerar: (itens: ItemGeradoMedicao[], appointmentId: number) => void;
  onFechar: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [evento, setEvento] = useState<EventoAgenda | null>(null);
  const [ambientes, setAmbientes] = useState<AmbienteAgenda[]>([]);
  const [carregandoAmbientes, setCarregandoAmbientes] = useState(false);
  // Folhas por índice de ambiente; '' = ambiente não entra no orçamento.
  const [folhas, setFolhas] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setTermo(clienteSugerido?.trim() ?? '');
    setEventos([]); setBuscou(false); setEvento(null);
    setAmbientes([]); setFolhas({}); setErro(null);
  }, [aberto, clienteSugerido]);

  if (!aberto) return null;

  const mensagemErro = (e: unknown, padrao: string) =>
    e instanceof ApiError ? (e.data as { message?: string } | null)?.message ?? e.message : padrao;

  async function buscar() {
    const t = termo.trim();
    if (!t) return;
    setBuscando(true); setErro(null); setBuscou(false);
    try {
      // Só dígitos = número da OS; o resto é nome de cliente. O nome no Agenda
      // às vezes é de quem recebe o técnico, não do comprador — por isso as duas.
      const query = /^\d+$/.test(t) ? `os=${encodeURIComponent(t)}` : `cliente=${encodeURIComponent(t)}`;
      const r = await api.get<{ eventos: EventoAgenda[] }>(`/agenda/eventos/buscar?${query}`);
      setEventos(r.eventos);
      setBuscou(true);
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível buscar no Agenda.'));
    } finally {
      setBuscando(false);
    }
  }

  async function escolher(ev: EventoAgenda) {
    setEvento(ev); setCarregandoAmbientes(true); setErro(null);
    try {
      const r = await api.get<{ ambientes: AmbienteAgenda[] }>(`/agenda/eventos/${ev.id}/ambientes`);
      setAmbientes(r.ambientes);
      const inicial: Record<number, string> = {};
      r.ambientes.forEach((a, i) => {
        if (a.medido) inicial[i] = String(a.folhas_sugeridas && a.folhas_sugeridas > 0 ? a.folhas_sugeridas : 1);
      });
      setFolhas(inicial);
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível ler os ambientes desta OS.'));
    } finally {
      setCarregandoAmbientes(false);
    }
  }

  const previa = ambientes.map((a, i) => {
    const n = Number(folhas[i]);
    if (!a.medido || !Number.isInteger(n) || n <= 0) return [];
    return dividirLarguraEmFolhas(a.largura!, n);
  });
  const totalItens = previa.reduce((s, p) => s + p.length, 0);

  function gerar() {
    const itens: ItemGeradoMedicao[] = [];
    ambientes.forEach((a, i) => {
      for (const largura of previa[i]) {
        itens.push({ ambiente: a.nome, largura, altura: a.altura! });
      }
    });
    if (itens.length === 0 || !evento) return;
    onGerar(itens, evento.id);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onFechar}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, maxWidth: 620, width: '100%', maxHeight: '90vh', boxShadow: 'var(--shadow-modal)', zIndex: 200, display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="medicao-agenda-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ overflowY: 'auto', padding: 20 }}>
          <div className="text-lg-ui font-bold mb-1" id="medicao-agenda-titulo">Partir de uma medição</div>
          <div className="text-sm-ui text-neutral-600 mb-4">
            Busque a OS de medição no Agenda. As medidas do técnico viram itens aqui, já divididos em folhas.
          </div>

          {!evento ? (
            <>
              <label className="form-label" htmlFor="medicao-busca">Cliente ou número da OS</label>
              <div className="flex gap-2">
                <input
                  id="medicao-busca"
                  className="input"
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }}
                  placeholder="Ex.: Maria Silva  ou  827"
                  autoFocus
                />
                <button type="button" className="btn btn-default" onClick={() => void buscar()} disabled={buscando || !termo.trim()}>
                  <FontAwesomeIcon icon={buscando ? faSpinner : faMagnifyingGlass} spin={buscando} /> Buscar
                </button>
              </div>

              {buscou && eventos.length === 0 && (
                <div className="alert alert-info mt-3 text-xs-ui"><span>Nenhuma OS encontrada. Tente outro nome ou o número da OS.</span></div>
              )}

              {eventos.length > 0 && (
                <div className="mt-3 border border-neutral-300 rounded-sm" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {eventos.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => void escolher(ev)}
                      className="block w-full text-left px-3 py-2 text-sm-ui hover:bg-neutral-100 border-b border-neutral-200"
                    >
                      <div className="font-semibold text-neutral-800">
                        OS {ev.id} · {rotuloTipo(ev.tipo)}
                        {ev.pedido_codigo ? <span className="text-xs-ui text-neutral-500"> · pedido {ev.pedido_codigo}</span> : null}
                      </div>
                      <div className="text-xs-ui text-neutral-500">
                        {ev.cliente_nome}
                        {ev.agendado_para ? ` · ${new Date(ev.agendado_para).toLocaleDateString('pt-BR')}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-sm-ui">
                  <div className="font-semibold text-neutral-800">OS {evento.id} · {rotuloTipo(evento.tipo)}</div>
                  <div className="text-xs-ui text-neutral-500">{evento.cliente_nome}</div>
                </div>
                <button type="button" className="btn btn-default btn-xs" onClick={() => { setEvento(null); setAmbientes([]); }}>
                  Trocar OS
                </button>
              </div>

              {carregandoAmbientes ? (
                <div className="text-neutral-500 text-sm-ui"><FontAwesomeIcon icon={faSpinner} spin /> Carregando ambientes…</div>
              ) : ambientes.length === 0 ? (
                <div className="alert alert-info text-xs-ui"><span>Esta OS ainda não tem ambientes registrados.</span></div>
              ) : (
                <div className="space-y-2">
                  {ambientes.map((a, i) => (
                    <div key={a.id ?? i} className="rounded-sm border border-neutral-300 p-3" style={{ background: 'var(--neutral-50)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div style={{ minWidth: 0 }}>
                          <div className="font-semibold text-sm-ui text-neutral-800">{a.nome}</div>
                          {a.medido ? (
                            <div className="text-xs-ui text-neutral-600 font-mono tabular-nums">
                              <FontAwesomeIcon icon={faRulerCombined} className="text-neutral-400" />{' '}
                              {formatNum(a.largura!)} × {formatNum(a.altura!)} m
                            </div>
                          ) : (
                            <div className="text-xs-ui text-warning">Sem medida estruturada — o técnico anotou em texto.</div>
                          )}
                          {a.observacao && <div className="text-xs-ui text-neutral-500 mt-1">{a.observacao}</div>}
                          {a.fotos.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {a.fotos.slice(0, 4).map((f) => (
                                <a key={f} href={f} target="_blank" rel="noreferrer" title="Abrir foto da medição">
                                  <img src={f} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, border: '1px solid var(--neutral-300)' }} />
                                </a>
                              ))}
                              {a.fotos.length > 4 && (
                                <span className="text-xs-ui text-neutral-500 self-end">
                                  <FontAwesomeIcon icon={faImage} /> +{a.fotos.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {a.medido && (
                          <div style={{ width: 110, flexShrink: 0 }}>
                            <label className="form-label" htmlFor={`folhas-${i}`}>Folhas</label>
                            <input
                              id={`folhas-${i}`}
                              className="input input-mono"
                              type="number"
                              min={0}
                              step={1}
                              value={folhas[i] ?? ''}
                              onChange={(e) => setFolhas((p) => ({ ...p, [i]: e.target.value }))}
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                      {previa[i].length > 0 && (
                        <div className="helper-text mt-2">
                          {previa[i].length} {previa[i].length === 1 ? 'folha' : 'folhas'} de{' '}
                          <strong className="font-mono tabular-nums">
                            {[...new Set(previa[i])].map((v) => formatNum(v)).join(' e ')} m
                          </strong>
                          {' '}× {formatNum(a.altura!)} m
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="helper-text">
                    Deixe 0 nos ambientes que não entram. A divisão é igual como ponto de partida — ajuste as larguras nos itens depois.
                  </div>
                </div>
              )}
            </>
          )}

          {erro && <div className="helper-error mt-3">{erro}</div>}
        </div>

        <div className="flex justify-end gap-2" style={{ padding: '12px 20px', borderTop: '1px solid var(--neutral-300)' }}>
          <button type="button" className="btn btn-default" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-success" onClick={gerar} disabled={totalItens === 0}>
            {totalItens > 0 ? `Gerar ${totalItens} ${totalItens === 1 ? 'item' : 'itens'}` : 'Gerar itens'}
          </button>
        </div>
      </div>
    </div>
  );
}
