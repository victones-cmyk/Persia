// apps/web/src/components/ClienteSearch.tsx
// Busca de cliente no GestãoClick com debounce de 300ms (SRD §8/§13).

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faXmark, faMagnifyingGlass, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
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
  const [modalAberto, setModalAberto] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);
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

  async function criarCliente() {
    const nome = novoNome.trim();
    const telefone = novoTelefone.trim();
    if (nome.length < 2) {
      setErroCadastro('Informe o nome do cliente.');
      return;
    }
    setSalvando(true);
    setErroCadastro(null);
    try {
      const r = await api.post<{ cliente: ClienteResumo }>('/gc/clientes', { nome, telefone });
      onSelecionar(r.cliente);
      setTermo('');
      setResultados([]);
      setAberto(false);
      setModalAberto(false);
      setNovoNome('');
      setNovoTelefone('');
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.data as { message?: string } | null)?.message ?? e.message
        : 'Não foi possível cadastrar o cliente.';
      setErroCadastro(msg);
    } finally {
      setSalvando(false);
    }
  }

  function abrirCadastro() {
    setNovoNome(termo.trim());
    setNovoTelefone('');
    setErroCadastro(null);
    setModalAberto(true);
    setAberto(false);
  }

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
          name="busca-cliente"
          aria-label="Buscar cliente"
          placeholder="Buscar cliente por nome ou documento…"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          style={{ paddingRight: 40 }}
        />
        <span style={{ position: 'absolute', right: 10, top: 10, color: 'var(--neutral-500)' }}>
          <FontAwesomeIcon icon={buscando ? faSpinner : faMagnifyingGlass} spin={buscando} />
        </span>
      </div>
      <div className="mt-2">
        <button type="button" className="btn btn-default btn-xs" onClick={abrirCadastro}>
          <FontAwesomeIcon icon={faUserPlus} /> Novo cliente
        </button>
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
      {modalAberto && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !salvando && setModalAberto(false)}
        >
          <div
            className="card"
            style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 440, width: '100%', boxShadow: 'var(--shadow-modal)', zIndex: 200 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="novo-cliente-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg-ui font-bold mb-1" id="novo-cliente-titulo">Novo cliente</div>
            <div className="text-sm-ui text-neutral-600 mb-4">
              Cadastro rápido como pessoa física no GestãoClick.
            </div>

            <label className="form-label" htmlFor="novo-cliente-nome">Nome</label>
            <input
              id="novo-cliente-nome"
              className="input mb-3"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              maxLength={150}
              autoFocus
            />

            <label className="form-label" htmlFor="novo-cliente-telefone">Telefone</label>
            <input
              id="novo-cliente-telefone"
              className="input"
              value={novoTelefone}
              onChange={(e) => setNovoTelefone(e.target.value)}
              maxLength={30}
              placeholder="Ex.: (11) 99999-9999"
            />

            <div className="mt-3 text-xs-ui text-neutral-500">
              Tipo de pessoa: PF
            </div>

            {erroCadastro && (
              <div className="mt-3 text-sm-ui" style={{ color: 'var(--color-error)' }}>
                {erroCadastro}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-default" disabled={salvando} onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-success" disabled={salvando} onClick={criarCliente}>
                {salvando && <FontAwesomeIcon icon={faSpinner} spin />} Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
