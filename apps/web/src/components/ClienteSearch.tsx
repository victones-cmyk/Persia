// apps/web/src/components/ClienteSearch.tsx
// Busca de cliente no GestãoClick com debounce de 300ms (SRD §8/§13).

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faXmark, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import type { ClienteResumo } from '../lib/calcTypes';

export function ClienteSearch({
  selecionado,
  onSelecionar,
}: {
  selecionado: ClienteResumo | null;
  onSelecionar: (c: ClienteResumo | null) => void;
}) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selecionado) return; // não busca enquanto há seleção
    if (termo.trim().length < 2) {
      setResultados([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setBuscando(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get<{ clientes: ClienteResumo[] }>(`/gc/clientes?q=${encodeURIComponent(termo)}`);
        setResultados(r.clientes);
        setAberto(true);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [termo, selecionado]);

  if (selecionado) {
    return (
      <div className="flex items-center justify-between border border-action-add rounded p-2" style={{ background: '#f4fff9' }}>
        <div className="text-sm-ui">
          <div className="font-semibold text-neutral-800">{selecionado.nome}</div>
          <div className="text-xs-ui text-neutral-500">
            {selecionado.tipo_pessoa} {selecionado.documento ? `· ${selecionado.documento}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelecionar(null);
            setTermo('');
          }}
          className="text-neutral-500 hover:text-neutral-800 px-2"
          title="Trocar cliente"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          className="input"
          placeholder="Buscar cliente por nome ou documento…"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          style={{ paddingRight: 32 }}
        />
        <span style={{ position: 'absolute', right: 10, top: 10, color: 'var(--neutral-500)' }}>
          <FontAwesomeIcon icon={buscando ? faSpinner : faMagnifyingGlass} spin={buscando} />
        </span>
      </div>
      {aberto && resultados.length > 0 && (
        <div
          className="absolute left-0 right-0 bg-surface-card border border-neutral-300 rounded-b z-10 max-h-56 overflow-y-auto"
          style={{ boxShadow: 'var(--shadow-dropdown)' }}
        >
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelecionar(c);
                setAberto(false);
              }}
              className="block w-full text-left px-3 py-2 text-sm-ui hover:bg-neutral-100 border-b border-neutral-200"
            >
              <span className="text-neutral-800">{c.nome}</span>
              {c.documento && <span className="text-xs-ui text-neutral-500"> · {c.documento}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
