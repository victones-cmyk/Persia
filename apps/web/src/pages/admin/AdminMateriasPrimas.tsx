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
