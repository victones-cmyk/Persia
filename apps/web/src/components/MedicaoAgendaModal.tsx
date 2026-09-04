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

type TipoProduto = 'persiana' | 'cortina';

interface AmbienteAgenda {
  id: string | null;
  nome: string;
  tipos_produto: TipoProduto[];
  trilho_especial: boolean;
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

/** O que sai do modal, já separado por seção do orçamento. */
export interface GeracaoMedicao {
  persianas: ItemGeradoMedicao[];
  cortinas: ItemGeradoMedicao[];
  /** Um trilho por ambiente de cortina marcado com trilho especial (largura do vão inteiro). */
  trilhos: { ambiente: string; largura: number }[];
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
  onGerar: (geracao: GeracaoMedicao, appointmentId: number) => void;
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
  // Folhas por ambiente E por produto: o mesmo vão vira, por exemplo, 5 persianas
  // e 2 cortinas — as contagens não se derivam uma da outra.
  const [folhas, setFolhas] = useState<Record<string, string>>({});
  // Quais produtos entram, por ambiente. Vem marcado do Agenda quando alguém
  // marcou, mas quem decide é o vendedor — pode trocar aqui sem mexer na OS.
  const [tipos, setTipos] = useState<Record<number, TipoProduto[]>>({});
  const [comTrilho, setComTrilho] = useState<Record<number, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setTermo(clienteSugerido?.trim() ?? '');
    setEventos([]); setBuscou(false); setEvento(null);
    setAmbientes([]); setFolhas({}); setTipos({}); setComTrilho({}); setErro(null);
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
      const inicial: Record<string, string> = {};
      const tiposIniciais: Record<number, TipoProduto[]> = {};
      const trilhoInicial: Record<number, boolean> = {};
      r.ambientes.forEach((a, i) => {
        if (!a.medido) return;
        // Sem marcação na OS, assume persiana — é o caso mais comum e o vendedor troca num clique.
        const ts = a.tipos_produto.length > 0 ? a.tipos_produto : (['persiana'] as TipoProduto[]);
        tiposIniciais[i] = ts;
        trilhoInicial[i] = a.trilho_especial;
        // A sugestão do técnico é do vão, então serve de partida para os dois.
        const sug = String(a.folhas_sugeridas && a.folhas_sugeridas > 0 ? a.folhas_sugeridas : 1);
        for (const t of ts) inicial[`${i}:${t}`] = sug;
      });
      setFolhas(inicial); setTipos(tiposIniciais); setComTrilho(trilhoInicial);
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível ler os ambientes desta OS.'));
    } finally {
      setCarregandoAmbientes(false);
    }
  }

  const partesDe = (i: number, a: AmbienteAgenda, t: TipoProduto): number[] => {
    if (!a.medido || !(tipos[i] ?? []).includes(t)) return [];
    const n = Number(folhas[`${i}:${t}`]);
    if (!Number.isInteger(n) || n <= 0) return [];
    return dividirLarguraEmFolhas(a.largura!, n);
  };
  const previa = ambientes.map((a, i) => ({
    persiana: partesDe(i, a, 'persiana'),
    cortina: partesDe(i, a, 'cortina'),
  }));
  const totalItens = previa.reduce((s, p) => s + p.persiana.length + p.cortina.length, 0);

  function gerar() {
    const geracao: GeracaoMedicao = { persianas: [], cortinas: [], trilhos: [] };
    ambientes.forEach((a, i) => {
      for (const largura of previa[i].persiana) {
        geracao.persianas.push({ ambiente: a.nome, largura, altura: a.altura! });
      }
      for (const largura of previa[i].cortina) {
        geracao.cortinas.push({ ambiente: a.nome, largura, altura: a.altura! });
      }
      // Um trilho por ambiente, com a largura do vão inteiro — o trilho atravessa
      // o vão todo, não acompanha a divisão das folhas.
      if (previa[i].cortina.length > 0 && comTrilho[i]) {
        geracao.trilhos.push({ ambiente: a.nome, largura: a.largura! });
      }
    });
    if (!evento) return;
    if (geracao.persianas.length + geracao.cortinas.length === 0) return;
    onGerar(geracao, evento.id);
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
                          <div style={{ width: 168, flexShrink: 0 }}>
                            <div className="form-label">O que vai aqui</div>
                            {(['persiana', 'cortina'] as const).map((t) => {
                              const marcado = (tipos[i] ?? []).includes(t);
                              return (
                                <div key={t} className="flex items-center gap-2 mb-1">
                                  <label className="flex items-center gap-1 text-xs-ui text-neutral-700" style={{ cursor: 'pointer', flex: 1 }}>
                                    <input
                                      type="checkbox"
                                      checked={marcado}
                                      onChange={(e) => {
                                        const ligar = e.target.checked;
                                        setTipos((p) => {
                                          const atuais = p[i] ?? [];
                                          return { ...p, [i]: ligar ? [...atuais, t] : atuais.filter((x) => x !== t) };
                                        });
                                        // Ao ligar, parte da sugestão do técnico; ao desligar, some com a contagem.
                                        setFolhas((p) => {
                                          const n = { ...p };
                                          if (ligar) n[`${i}:${t}`] = n[`${i}:${t}`] ?? String(a.folhas_sugeridas && a.folhas_sugeridas > 0 ? a.folhas_sugeridas : 1);
                                          else delete n[`${i}:${t}`];
                                          return n;
                                        });
                                        if (t === 'cortina' && !ligar) setComTrilho((p) => ({ ...p, [i]: false }));
                                      }}
                                    />
                                    {t === 'persiana' ? 'Persiana' : 'Cortina'}
                                  </label>
                                  <input
                                    className="input input-mono"
                                    style={{ width: 56, height: 30, padding: '2px 6px' }}
                                    type="number"
                                    min={0}
                                    step={1}
                                    aria-label={`Folhas de ${t} em ${a.nome}`}
                                    disabled={!marcado}
                                    value={folhas[`${i}:${t}`] ?? ''}
                                    onChange={(e) => setFolhas((p) => ({ ...p, [`${i}:${t}`]: e.target.value }))}
                                  />
                                </div>
                              );
                            })}
                            {(tipos[i] ?? []).includes('cortina') && (
                              <label className="flex items-center gap-1 text-xs-ui text-neutral-600" style={{ cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={comTrilho[i] ?? false}
                                  onChange={(e) => setComTrilho((p) => ({ ...p, [i]: e.target.checked }))}
                                />
                                Trilho especial
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                      {(previa[i].persiana.length > 0 || previa[i].cortina.length > 0) && (
                        <div className="helper-text mt-2">
                          {(['persiana', 'cortina'] as const).filter((t) => previa[i][t].length > 0).map((t) => (
                            <div key={t}>
                              {previa[i][t].length} {t === 'persiana'
                                ? (previa[i][t].length === 1 ? 'persiana' : 'persianas')
                                : (previa[i][t].length === 1 ? 'cortina' : 'cortinas')} de{' '}
                              <strong className="font-mono tabular-nums">
                                {[...new Set(previa[i][t])].map((v) => formatNum(v)).join(' e ')} m
                              </strong>
                              {' '}× {formatNum(a.altura!)} m
                            </div>
                          ))}
                          {previa[i].cortina.length > 0 && comTrilho[i] && (
                            <div>1 trilho especial de <strong className="font-mono tabular-nums">{formatNum(a.largura!)} m</strong> (vão inteiro)</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="helper-text">
                    Desmarque o que não entra. A divisão é igual como ponto de partida — ajuste as larguras nos itens depois.
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
