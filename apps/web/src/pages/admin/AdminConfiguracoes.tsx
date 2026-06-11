// apps/web/src/pages/admin/AdminConfiguracoes.tsx
// Edição das configurações globais (desconto_max_vendedor_pct / desconto_max_admin_pct).

import { useEffect, useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';

interface Config {
  chave: string;
  valor: string;
  descricao: string | null;
}

const ROTULO: Record<string, string> = {
  desconto_max_vendedor_pct: 'Desconto máximo do vendedor (%)',
  desconto_max_admin_pct: 'Desconto máximo do admin (%)',
};

export function AdminConfiguracoes() {
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .get<{ configuracoes: Config[] }>('/admin/configuracoes')
      .then((r) => setConfigs(r.configuracoes))
      .finally(() => setCarregando(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api.put<{ configuracoes: Config[] }>('/admin/configuracoes', { configuracoes: configs });
      setConfigs(r.configuracoes);
      showToast('success', 'Configurações salvas');
    } catch {
      showToast('error', 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando…</div>;

  return (
    <div>
      <h1 className="text-2xl-ui mb-4">Configurações</h1>
      <form onSubmit={submit} className="card p-6 max-w-form space-y-4">
        {configs.map((c, i) => (
          <div key={c.chave}>
            <label className="form-label">{ROTULO[c.chave] ?? c.chave}</label>
            <input
              className="input"
              value={c.valor}
              onChange={(e) => {
                const novo = [...configs];
                novo[i] = { ...c, valor: e.target.value };
                setConfigs(novo);
              }}
            />
            {c.descricao && <div className="helper-text">{c.descricao}</div>}
          </div>
        ))}
        <button type="submit" className="btn btn-success" disabled={salvando}>
          {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Salvar'}
        </button>
      </form>
    </div>
  );
}
