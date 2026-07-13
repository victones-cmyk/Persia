import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate, faDatabase, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../hooks/useToast';

interface StatusCatalogoLocal {
  ultima_sync_em: string | null;
  em_andamento: boolean;
  sucesso: boolean | null;
  total_produtos: number;
  grupos: number;
  erro: string | null;
}

interface ResumoSync {
  inicio: string;
  fim: string;
  sucesso: boolean;
  grupos: number;
  produtos_recebidos: number;
  produtos_salvos: number;
  produtos_inativados: number;
  erro?: string;
}

interface DiagnosticoProdutoLocal {
  id: string;
  nome: string;
  codigo_interno: string | null;
  grupo_id: string | null;
  nome_grupo: string | null;
  ativo: boolean;
  valor_venda: string;
  preco_varejo: number;
  custo_varejo: number;
  grupos_sync: string[];
  valores: { tipo_id?: unknown; nome_tipo?: unknown; valor_venda?: unknown; valor_custo?: unknown }[];
  sincronizado_em: string;
}

interface DiagnosticoComponente {
  codigo_interno: string;
  produtos_locais: DiagnosticoProdutoLocal[];
  preco_calculadora: { codigo_interno: string; nome: string; preco: number; custo: number } | null;
}

function dataHora(iso: string | null): string {
  if (!iso) return 'Nunca';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function statusTexto(status: StatusCatalogoLocal | null): { label: string; classe: string } {
  if (!status) return { label: 'Carregando', classe: 'badge-secondary' };
  if (status.em_andamento) return { label: 'Atualizando', classe: 'badge-warning' };
  if (status.sucesso === false) return { label: 'Erro', classe: 'badge-danger' };
  if (status.ultima_sync_em) return { label: 'Atualizado', classe: 'badge-success' };
  return { label: 'Não sincronizado', classe: 'badge-secondary' };
}

export function AdminMateriasPrimas() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<StatusCatalogoLocal | null>(null);
  const [ultimoResumo, setUltimoResumo] = useState<ResumoSync | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [codigoDiagnostico, setCodigoDiagnostico] = useState('5014037651965');
  const [diagnostico, setDiagnostico] = useState<DiagnosticoComponente | null>(null);
  const [diagnosticando, setDiagnosticando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<{ status: StatusCatalogoLocal }>('/admin/gc/catalogo-local/status');
      setStatus(r.status);
    } catch (e) {
      showToast('error', 'Falha ao carregar status', e instanceof ApiError ? e.message : '');
    } finally {
      setCarregando(false);
    }
  }, [showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await api.post<{ resumo: ResumoSync; status: StatusCatalogoLocal }>('/admin/gc/catalogo-local/sincronizar');
      setStatus(r.status);
      setUltimoResumo(r.resumo);
      showToast('success', 'Matérias-primas atualizadas', `${r.resumo.produtos_salvos} produtos sincronizados.`);
    } catch (e) {
      showToast('error', 'Falha ao atualizar', e instanceof ApiError ? e.message : '');
      await carregar();
    } finally {
      setSincronizando(false);
    }
  }

  async function consultarDiagnostico() {
    const codigo = codigoDiagnostico.trim();
    if (!codigo) return;
    setDiagnosticando(true);
    try {
      const r = await api.get<DiagnosticoComponente>(`/admin/gc/catalogo-local/diagnostico-componente?codigo_interno=${encodeURIComponent(codigo)}`);
      setDiagnostico(r);
    } catch (e) {
      showToast('error', 'Falha ao consultar componente', e instanceof ApiError ? e.message : '');
    } finally {
      setDiagnosticando(false);
    }
  }

  const st = statusTexto(status);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl-ui font-bold text-neutral-800">Matérias-primas</h1>
        <button className="btn btn-success" type="button" onClick={sincronizar} disabled={sincronizando || status?.em_andamento}>
          {sincronizando || status?.em_andamento
            ? <><FontAwesomeIcon icon={faSpinner} spin /> Atualizando</>
            : <><FontAwesomeIcon icon={faArrowsRotate} /> Atualizar matérias-primas</>}
        </button>
      </div>

      <div className="alert alert-info mb-4 text-sm-ui">
        O cálculo usa o catálogo local para tecidos, componentes, acessórios e instalação. O GestãoClick continua sendo usado no envio de orçamentos e vendas.
      </div>

      <div className="card p-4 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center bg-neutral-100 border border-neutral-300 rounded-sm text-neutral-700">
            <FontAwesomeIcon icon={faDatabase} />
          </div>
          <div>
            <div className="text-lg-ui font-semibold text-neutral-800">Catálogo local do GestãoClick</div>
            <div className="text-sm-ui text-neutral-600">Sincronização manual e atualização diária automática à meia-noite.</div>
          </div>
        </div>

        {carregando ? (
          <div className="skeleton" style={{ height: 96 }} />
        ) : (
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              <Linha label="Status" valor={<span className={`badge ${st.classe}`}>{st.label}</span>} />
              <Linha label="Última atualização" valor={dataHora(status?.ultima_sync_em ?? null)} />
              <Linha label="Produtos locais" valor={String(status?.total_produtos ?? 0)} />
              <Linha label="Grupos monitorados" valor={String(status?.grupos ?? 0)} />
              {status?.erro && <Linha label="Último erro" valor={<span className="text-danger">{status.erro}</span>} />}
            </tbody>
          </table>
        )}
      </div>

      {ultimoResumo && (
        <div className="card p-4">
          <h2 className="text-lg-ui font-semibold text-neutral-800 mb-3">Última execução manual</h2>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              <Linha label="Início" valor={dataHora(ultimoResumo.inicio)} />
              <Linha label="Fim" valor={dataHora(ultimoResumo.fim)} />
              <Linha label="Produtos recebidos" valor={String(ultimoResumo.produtos_recebidos)} />
              <Linha label="Produtos salvos" valor={String(ultimoResumo.produtos_salvos)} />
              <Linha label="Produtos inativados" valor={String(ultimoResumo.produtos_inativados)} />
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4 mt-4">
        <h2 className="text-lg-ui font-semibold text-neutral-800 mb-3">Diagnóstico de componente</h2>
        <div className="flex gap-2 mb-4">
          <input
            className="input"
            value={codigoDiagnostico}
            onChange={(e) => setCodigoDiagnostico(e.target.value)}
            placeholder="Código interno"
            style={{ maxWidth: 260 }}
          />
          <button className="btn btn-default" type="button" onClick={consultarDiagnostico} disabled={diagnosticando}>
            {diagnosticando ? <><FontAwesomeIcon icon={faSpinner} spin /> Consultando</> : 'Consultar'}
          </button>
        </div>

        {diagnostico && (
          <div>
            <table className="w-full mb-4" style={{ borderCollapse: 'collapse', fontSize: 14 }}>
              <tbody>
                <Linha label="Preço usado pela calculadora" valor={diagnostico.preco_calculadora ? `R$ ${diagnostico.preco_calculadora.preco.toFixed(2).replace('.', ',')}` : 'Não encontrado'} />
                <Linha label="Produto da calculadora" valor={diagnostico.preco_calculadora?.nome ?? '—'} />
              </tbody>
            </table>

            <div className="text-sm-ui font-semibold text-neutral-700 mb-2">Registros locais</div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                    {['Produto', 'Grupo atual', 'Grupos sync', 'Ativo', 'Valor raiz', 'Varejo', 'Tabelas'].map((h) => (
                      <th key={h} style={{ padding: 8, textAlign: 'left', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diagnostico.produtos_locais.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 12, color: '#6c757d' }}>Nenhum produto local encontrado para este código.</td></tr>
                  ) : diagnostico.produtos_locais.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid #dee2e6' }}>
                      <td style={{ padding: 8 }}>{p.nome}<div className="text-xs-ui text-neutral-500">{p.id}</div></td>
                      <td style={{ padding: 8 }}>{p.nome_grupo ?? p.grupo_id ?? '—'}</td>
                      <td style={{ padding: 8 }}>{p.grupos_sync.join(', ') || '—'}</td>
                      <td style={{ padding: 8 }}>{p.ativo ? 'Sim' : 'Não'}</td>
                      <td style={{ padding: 8 }}>R$ {Number(p.valor_venda).toFixed(2).replace('.', ',')}</td>
                      <td style={{ padding: 8 }}>R$ {p.preco_varejo.toFixed(2).replace('.', ',')}</td>
                      <td style={{ padding: 8 }}>{p.valores.map((v) => String(v.nome_tipo ?? v.tipo_id ?? '—')).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <tr style={{ borderTop: '1px solid #dee2e6' }}>
      <th style={{ padding: '10px 12px', textAlign: 'left', width: 220, fontWeight: 700 }} className="text-neutral-700">{label}</th>
      <td style={{ padding: '10px 12px' }}>{valor}</td>
    </tr>
  );
}
