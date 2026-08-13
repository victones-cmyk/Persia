// apps/web/src/components/BuscaSelect.tsx
// Combobox de busca genérico (autocompletar) sobre uma lista já carregada — mesmo
// padrão do TecidoSearch, reaproveitado para os ACESSÓRIOS de cortina (Victor 27/06/2026:
// a variedade é grande e o dropdown ficava lento). Filtra por palavras (qualquer ordem),
// seleção por clique ou teclado (setas + Enter), botão de limpar. `compact` deixa o
// campo menor (linhas densas de acessório). Exibe "nome — R$ preço" quando há preço.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import { formatBRL, semAcento } from '../lib/formatacao';

export interface OpcaoBusca {
  id: string;
  nome: string;
  preco?: number;
}

const MAX_VISIVEL = 100;

export function BuscaSelect({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
  compact,
  invalid,
}: {
  options: OpcaoBusca[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
  /** Realça em pontilhado vermelho — campo obrigatório ainda vazio. */
  invalid?: boolean;
}) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);

  const selecionado = options.find((o) => o.id === value) ?? null;

  // Sincroniza o texto quando a seleção muda POR FORA (ex.: restauro/edição).
  useEffect(() => {
    if (value !== lastEmitted.current) {
      const o = value ? options.find((x) => x.id === value) : null;
      setTermo(o ? o.nome : '');
      lastEmitted.current = value;
    }
  }, [value, options]);

  // Quando a seleção atual deixa de existir na lista (lista chegou depois), mostra o nome.
  useEffect(() => {
    if (value && selecionado && termo === '') setTermo(selecionado.nome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Fecha ao clicar fora.
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

  const termoTrim = semAcento(termo.trim().toLowerCase());
  const mostrarTodos = !termoTrim || (selecionado !== null && termo === selecionado.nome);
  const palavras = termoTrim.split(/\s+/).filter(Boolean);
  const matches = mostrarTodos
    ? options
    : options.filter((o) => {
        const nome = semAcento(o.nome.toLowerCase());
        return palavras.every((p) => nome.includes(p));
      });
  const filtrados = matches.slice(0, MAX_VISIVEL);

  function selecionar(o: OpcaoBusca) {
    setTermo(o.nome);
    emit(o.id);
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

  const inputStyle = compact ? { height: 30, fontSize: 12, paddingRight: 28 } : { paddingRight: 32 };

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <input
          className={invalid ? 'input border-2 border-dashed border-error' : 'input'}
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder={placeholder}
          value={termo}
          autoComplete="off"
          style={inputStyle}
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
        <span style={{ position: 'absolute', right: 9, top: compact ? 7 : 10, color: 'var(--neutral-500)', fontSize: compact ? 12 : undefined }}>
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
          className="absolute left-0 right-0 bg-surface-card border border-neutral-300 rounded-b z-20 max-h-56 overflow-y-auto"
          style={{ boxShadow: 'var(--shadow-dropdown)' }}
        >
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-sm-ui text-neutral-500">Nenhum item encontrado.</div>
          ) : (
            filtrados.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onMouseEnter={() => setDestaque(i)}
                onClick={() => selecionar(o)}
                className="block w-full text-left px-3 py-2 text-sm-ui border-b border-neutral-200"
                style={{ background: i === destaque ? 'var(--neutral-100)' : undefined }}
              >
                <span className="text-neutral-800">{o.nome}</span>
                {o.preco != null && <span className="text-xs-ui text-neutral-500"> — {formatBRL(o.preco)}</span>}
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
