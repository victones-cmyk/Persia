// apps/web/src/pages/RelatorioEstoque.tsx
// O que saiu do estoque, por dia, e para onde foi.
//
// Existe porque o GestãoClick não guarda o motivo de uma baixa: a API deles não
// expõe ajuste de estoque, então tudo o que a Pérsia consegue gravar lá é o novo
// saldo do produto — um número que muda sem dizer por quê. O "para onde foi"
// vive só no log da Pérsia, e até agora não tinha tela.
//
// Cada baixa mostra o material com saldo antes e depois, e as OS que o
// consumiram. É o que a tela de Ajustes do GC mostraria, se a API a expusesse.

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxOpen, faRotateRight, faTriangleExclamation, faSpinner, faChevronRight, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { formatNum } from '../lib/formatacao';

interface Material {
  produto_id: string;
  nome: string;
  estoque_antes: number;
  estoque_depois: number;
  quantidade: number;
}

interface Baixa {
  criado_em: string;
  dia: string;
  pedido: string | null;
  cliente: string | null;
  orcamento_id: string | null;
  por: string | null;
  destino: string | null;
  ordens: string[];
  materiais: Material[];
  falhas: { produto_id: string; nome: string; erro: string }[];
}

interface Dia {
  dia: string;
  baixas: Baixa[];
  total_materiais: number;
  total_falhas: number;
}

const diaLegivel = (iso: string): string => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(a, m - 1, d));
};

const hora = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function RelatorioEstoque() {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [dias, setDias] = useState<Dia[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Uma baixa por vez aberta é o suficiente: o detalhe é longo (material a
  // material) e várias abertas viram rolagem sem fim.
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const p = new URLSearchParams();
      if (de) p.set('de', de);
      if (ate) p.set('ate', ate);
      const r = await api.get<{ total: number; dias: Dia[] }>(`/orcamentos/estoque-saida/relatorio?${p.toString()}`);
      setDias(r.dias);
      setTotal(r.total);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o relatório.');
      setDias([]);
    } finally {
      setCarregando(false);
    }
  }, [de, ate]);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl-ui font-bold text-neutral-800">
          <FontAwesomeIcon icon={faBoxOpen} className="text-neutral-500" /> Baixas de estoque
        </h1>
        <button className="btn btn-default btn-sm" disabled={carregando} onClick={() => void carregar()}>
          <FontAwesomeIcon icon={carregando ? faSpinner : faRotateRight} spin={carregando} /> Atualizar
        </button>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div style={{ minWidth: 160 }}>
          <label className="form-label" htmlFor="rel-de">De</label>
          <input id="rel-de" type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="form-label" htmlFor="rel-ate">Até</label>
          <input id="rel-ate" type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        {(de || ate) && (
          <button className="btn btn-default btn-sm" onClick={() => { setDe(''); setAte(''); }}>Limpar período</button>
        )}
        <div className="text-sm-ui text-neutral-600 ml-auto">
          {total} {total === 1 ? 'baixa' : 'baixas'}
        </div>
      </div>

      {erro && <div className="alert alert-danger mb-4">{erro}</div>}

      {carregando && dias.length === 0 && (
        <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando…</div>
      )}

      {!carregando && dias.length === 0 && !erro && (
        <div className="alert alert-info">Nenhuma baixa de estoque no período.</div>
      )}

      {dias.map((d) => (
        <div key={d.dia} className="mb-4">
          <div className="flex flex-wrap items-baseline gap-2 mb-2">
            <span className="text-md-ui font-bold text-neutral-800">{diaLegivel(d.dia)}</span>
            <span className="text-xs-ui text-neutral-500">
              {d.baixas.length} {d.baixas.length === 1 ? 'pedido' : 'pedidos'} · {d.total_materiais} materiais
            </span>
            {d.total_falhas > 0 && (
              <span className="text-xs-ui" style={{ color: 'var(--color-error-text)' }}>
                <FontAwesomeIcon icon={faTriangleExclamation} /> {d.total_falhas} não baixaram
              </span>
            )}
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm-ui" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {d.baixas.map((b) => {
                  const id = b.criado_em + (b.pedido ?? '');
                  const expandida = aberta === id;
                  return (
                    <>
                      <tr
                        key={id}
                        style={{ borderBottom: '1px solid var(--neutral-200)', cursor: 'pointer' }}
                        onClick={() => setAberta(expandida ? null : id)}
                      >
                        <td style={{ padding: '10px 12px', width: 28 }}>
                          <FontAwesomeIcon icon={expandida ? faChevronDown : faChevronRight} className="text-neutral-400" />
                        </td>
                        <td style={{ padding: '10px 12px' }} className="font-mono tabular-nums">{hora(b.criado_em)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div className="font-semibold text-neutral-800">
                            {b.pedido ? `Pedido ${b.pedido}` : 'Pedido —'}
                          </div>
                          <div className="text-xs-ui text-neutral-500">{b.cliente ?? '—'}</div>
                        </td>
                        <td style={{ padding: '10px 12px' }} className="text-neutral-700">
                          {b.materiais.length} {b.materiais.length === 1 ? 'material' : 'materiais'}
                          {b.ordens.length > 0 && (
                            <div className="text-xs-ui text-neutral-500">
                              {b.ordens.length} {b.ordens.length === 1 ? 'OS' : 'OS'}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }} className="text-xs-ui text-neutral-500">{b.por ?? '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {b.falhas.length > 0 && (
                            <span className="badge" style={{ borderColor: 'var(--color-error-border)', color: 'var(--color-error-text)' }}>
                              <FontAwesomeIcon icon={faTriangleExclamation} /> {b.falhas.length}
                            </span>
                          )}
                        </td>
                      </tr>

                      {expandida && (
                        <tr key={`${id}-det`} style={{ borderBottom: '1px solid var(--neutral-200)' }}>
                          <td colSpan={6} style={{ padding: '0 12px 14px 40px', background: 'var(--neutral-50)' }}>
                            {b.destino && (
                              <div className="mb-3">
                                <div className="text-2xs-ui uppercase text-neutral-500 mb-1">Para onde foi</div>
                                <pre className="text-xs-ui text-neutral-700" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                                  {b.destino}
                                </pre>
                              </div>
                            )}

                            <div className="text-2xs-ui uppercase text-neutral-500 mb-1">Materiais baixados</div>
                            <table className="text-sm-ui" style={{ borderCollapse: 'collapse', minWidth: 420 }}>
                              <thead>
                                <tr className="text-2xs-ui uppercase text-neutral-500">
                                  <th className="text-left" style={{ padding: '4px 12px 4px 0' }}>Material</th>
                                  <th className="text-right" style={{ padding: '4px 12px' }}>Consumido</th>
                                  <th className="text-right" style={{ padding: '4px 12px' }}>Saldo antes</th>
                                  <th className="text-right" style={{ padding: '4px 0 4px 12px' }}>Saldo depois</th>
                                </tr>
                              </thead>
                              <tbody>
                                {b.materiais.map((m) => (
                                  <tr key={m.produto_id}>
                                    <td style={{ padding: '3px 12px 3px 0' }} className="text-neutral-800">{m.nome}</td>
                                    <td style={{ padding: '3px 12px' }} className="text-right font-mono tabular-nums">{formatNum(m.quantidade)}</td>
                                    <td style={{ padding: '3px 12px' }} className="text-right font-mono tabular-nums text-neutral-500">{formatNum(m.estoque_antes)}</td>
                                    <td style={{ padding: '3px 0 3px 12px' }} className="text-right font-mono tabular-nums">{formatNum(m.estoque_depois)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {b.falhas.length > 0 && (
                              <div className="mt-3">
                                <div className="text-2xs-ui uppercase mb-1" style={{ color: 'var(--color-error-text)' }}>
                                  Não baixaram
                                </div>
                                {b.falhas.map((f) => (
                                  <div key={f.produto_id} className="text-xs-ui text-neutral-700">
                                    <strong>{f.nome || f.produto_id}</strong> — {f.erro}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="helper-text mt-4">
        O GestãoClick não registra o motivo de uma baixa — a API dele não expõe ajuste de estoque, só a
        gravação do novo saldo. Este histórico existe apenas aqui.
      </p>
    </div>
  );
}
