// apps/web/src/pages/admin/AdminLog.tsx
// Log de ações (paginado 20/pág): data, usuário, ação, detalhe.

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import type { Paginacao } from '../../lib/orcamentoTypes';

interface LogAcao {
  id: string;
  acao: string;
  detalhe: unknown;
  criado_em: string;
  usuario?: { nome: string } | null;
}

function dataHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function AdminLog() {
  const [logs, setLogs] = useState<LogAcao[]>([]);
  const [pag, setPag] = useState<Paginacao | null>(null);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<{ logs: LogAcao[]; paginacao: Paginacao }>(`/admin/log-acoes?pagina=${pagina}`);
      setLogs(r.logs);
      setPag(r.paginacao);
    } finally {
      setCarregando(false);
    }
  }, [pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div>
      <h1 className="text-2xl-ui font-bold text-neutral-800 mb-4">Log de Ações</h1>
      <div className="card p-0 overflow-hidden">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
              {['Data/Hora', 'Usuário', 'Ação', 'Detalhe'].map((h) => (
                <th key={h} style={{ padding: 12, textAlign: 'left', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={4} style={{ padding: 16 }}><div className="skeleton" style={{ height: 18 }} /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#6c757d' }}>Nenhum registro.</td></tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid #dee2e6' }}>
                  <td style={{ padding: 12 }} className="text-sm-ui text-neutral-500 whitespace-nowrap">{dataHora(l.criado_em)}</td>
                  <td style={{ padding: 12 }} className="text-sm-ui">{l.usuario?.nome ?? '—'}</td>
                  <td style={{ padding: 12 }}><span className="badge badge-secondary">{l.acao}</span></td>
                  <td className="font-mono text-xs-ui text-neutral-600" style={{ padding: 12, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.detalhe ? JSON.stringify(l.detalhe) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pag && pag.totalPaginas > 1 && (
        <div className="flex items-center gap-1 mt-4">
          {Array.from({ length: pag.totalPaginas }).map((_, i) => {
            const p = i + 1;
            const ativo = p === pag.pagina;
            return (
              <button key={p} type="button" onClick={() => setPagina(p)}
                style={{ padding: '.5rem .75rem', background: ativo ? '#000' : '#fff', color: ativo ? '#fff' : '#6c757d', border: '1px solid ' + (ativo ? '#000' : '#dee2e6'), borderRadius: 3, fontSize: 14 }}>
                {p}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
