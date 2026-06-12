// apps/web/src/components/TecidoSearch.tsx
// Combobox de busca para a Coleção (Tecido) da persiana: filtra a lista já
// carregada conforme o usuário digita (a base é grande). Seleção por clique ou
// teclado (setas + Enter). Mantém compatibilidade com seleção externa (chips de
// alternativos da RN-01) e reset ao trocar o tipo de produto.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { TecidoOpcao } from '../lib/calcTypes';

const MAX_VISIVEL = 100;

export function TecidoSearch({
  tecidos,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  tecidos: TecidoOpcao[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);

  const selecionado = tecidos.find((t) => t.id === value) ?? null;

  // Sincroniza o texto quando a seleção muda POR FORA (ex.: chip de alternativo).
  useEffect(() => {
    if (value !== lastEmitted.current) {
      const t = value ? tecidos.find((x) => x.id === value) : null;
      setTermo(t ? t.nome : '');
      lastEmitted.current = value;
    }
  }, [value, tecidos]);

  // Ao recarregar a lista (troca de tipo) sem seleção, limpa o texto digitado.
  useEffect(() => {
    if (!value) setTermo('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tecidos]);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function emit(id: string) {
    lastEmitted.current = id;
    onChange(id);
  }

  const termoTrim = termo.trim().toLowerCase();
  // Quando o texto é exatamente o nome do selecionado, mostra a lista toda (permite rebuscar).
  const mostrarTodos = !termoTrim || (selecionado !== null && termo === selecionado.nome);
  // Cada palavra digitada precisa aparecer no nome (em qualquer ordem).
  const palavras = termoTrim.split(/\s+/).filter(Boolean);
  const matches = mostrarTodos
    ? tecidos
    : tecidos.filter((t) => {
        const nome = t.nome.toLowerCase();
        return palavras.every((p) => nome.includes(p));
      });
  const filtrados = matches.slice(0, MAX_VISIVEL);

  function selecionar(t: TecidoOpcao) {
    setTermo(t.nome);
    emit(t.id);
    setAberto(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!aberto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setAberto(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, filtrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === 'Enter') {
      if (aberto && filtrados[destaque]) {
        e.preventDefault();
        selecionar(filtrados[destaque]);
      }
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <input
          id="f-tecido"
          className="input"
          disabled={disabled}
          placeholder={placeholder}
          value={termo}
          autoComplete="off"
          style={{ paddingRight: 32 }}
          onChange={(e) => {
            setTermo(e.target.value);
            if (value) emit(''); // digitar invalida a seleção até escolher de novo
            setAberto(true);
            setDestaque(0);
          }}
          onFocus={(e) => {
            if (disabled) return;
            setAberto(true);
            e.currentTarget.select();
          }}
          onKeyDown={onKeyDown}
        />
        <span style={{ position: 'absolute', right: 10, top: 10, color: 'var(--neutral-500)' }}>
          {value ? (
            <button
              type="button"
              className="text-neutral-500 hover:text-neutral-800"
              title="Limpar"
              onClick={() => {
                emit('');
                setTermo('');
                setAberto(true);
              }}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          ) : (
            <FontAwesomeIcon icon={faMagnifyingGlass} />
          )}
        </span>
      </div>

      {aberto && !disabled && (
        <div
          className="absolute left-0 right-0 bg-surface-card border border-neutral-300 rounded-b z-10 max-h-56 overflow-y-auto"
          style={{ boxShadow: 'var(--shadow-dropdown)' }}
        >
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-sm-ui text-neutral-500">Nenhum tecido encontrado.</div>
          ) : (
            filtrados.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onMouseEnter={() => setDestaque(i)}
                onClick={() => selecionar(t)}
                className="block w-full text-left px-3 py-2 text-sm-ui border-b border-neutral-200"
                style={{ background: i === destaque ? 'var(--neutral-100)' : undefined }}
              >
                <span className="text-neutral-800">{t.nome}</span>
                <span className="text-xs-ui text-neutral-500"> — {t.dimensao_m.toFixed(2)}m</span>
              </button>
            ))
          )}
          {matches.length > MAX_VISIVEL && (
            <div className="px-3 py-1 text-2xs-ui text-neutral-500">
              Mostrando os primeiros {MAX_VISIVEL} de {matches.length}. Refine a busca.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
