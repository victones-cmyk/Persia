// apps/web/src/components/PeriodoRange.tsx
// Intervalo de datas (De/Até) em pt-BR: digitação mascarada dd/mm/aaaa + calendário
// PRÓPRIO em português. O filtro só é aplicado quando o usuário clica FORA do range
// (enquanto ele navega meses/seleciona dias, nada é aplicado). Rótulos sempre pt-BR.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import { parseBR, mascaraData, formatBR, mesmoDia } from '../lib/dataBR';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function soData(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendário pop-over em pt-BR. onSelect(null) = limpar. */
function CalendarioBR({ selecionado, min, max, onSelect }: {
  selecionado: Date | null;
  min?: Date | null;
  max?: Date | null;
  onSelect: (d: Date | null) => void;
}) {
  const [vis, setVis] = useState<Date>(() => {
    const base = selecionado ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const ano = vis.getFullYear();
  const mes = vis.getMonth();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const hoje = new Date();

  const desab = (d: Date) => {
    const dd = soData(d);
    if (min && dd < soData(min)) return true;
    if (max && dd > soData(max)) return true;
    return false;
  };

  const celulas: (Date | null)[] = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(new Date(ano, mes, d));

  const seta: React.CSSProperties = {
    width: 28, height: 28, border: '1px solid #dee2e6', background: '#fff', borderRadius: 3,
    cursor: 'pointer', color: '#495057', fontSize: 16, lineHeight: 1, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  };
  const link: React.CSSProperties = {
    background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontSize: 13, padding: '2px 4px',
  };

  return (
    <div
      style={{
        position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, background: '#fff',
        border: '1px solid #dee2e6', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,.15)',
        padding: 10, width: 252,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" style={seta} aria-label="Mês anterior" onClick={() => setVis(new Date(ano, mes - 1, 1))}>‹</button>
        <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{MESES[mes]} {ano}</span>
        <button type="button" style={seta} aria-label="Próximo mês" onClick={() => setVis(new Date(ano, mes + 1, 1))}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DIAS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, color: '#6c757d', fontWeight: 600 }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {celulas.map((d, i) => {
          if (!d) return <div key={i} />;
          const sel = selecionado != null && mesmoDia(d, selecionado);
          const eHoje = mesmoDia(d, hoje);
          const off = desab(d);
          return (
            <button
              key={i}
              type="button"
              disabled={off}
              onClick={() => onSelect(d)}
              style={{
                height: 30, border: 'none', borderRadius: 3, fontSize: 13,
                cursor: off ? 'default' : 'pointer',
                background: sel ? '#00a65a' : 'transparent',
                color: off ? '#ccc' : sel ? '#fff' : '#333',
                fontWeight: eHoje ? 700 : 400,
                boxShadow: eHoje && !sel ? 'inset 0 0 0 1px #00a65a' : 'none',
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button type="button" style={link} onClick={() => onSelect(null)}>Limpar</button>
        <button type="button" style={link} onClick={() => { if (!desab(hoje)) onSelect(hoje); }}>Hoje</button>
      </div>
    </div>
  );
}

/** Campo dd/mm/aaaa com máscara + botão/clique que abre o calendário pt-BR. */
function CampoData({ value, onChange, onCommit, min, max, disabled, ariaLabel, title }: {
  value: string;
  onChange: (v: string) => void;
  /** Chamado quando o usuário ESCOLHE no calendário (aplica na hora). */
  onCommit?: (v: string) => void;
  min?: Date | null;
  max?: Date | null;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [aberto]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: 150, flexShrink: 0 }} title={title}>
      <input
        type="text"
        inputMode="numeric"
        className="input"
        style={{ width: '100%', paddingRight: 30 }}
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(mascaraData(e.target.value))}
        onClick={() => { if (!disabled) setAberto(true); }}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Abrir calendário"
        onClick={() => { if (!disabled) setAberto((o) => !o); }}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none',
          border: 'none', padding: 0, lineHeight: 0, color: '#6c757d', cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <FontAwesomeIcon icon={faCalendarDays} />
      </button>
      {aberto && !disabled && (
        <CalendarioBR
          selecionado={parseBR(value)}
          min={min}
          max={max}
          onSelect={(d) => { const v = d ? formatBR(d) : ''; onChange(v); setAberto(false); onCommit?.(v); }}
        />
      )}
    </div>
  );
}

/**
 * Intervalo De/Até. Mantém estado "pendente" enquanto o usuário mexe; só chama
 * onAplicar (aplica o filtro) quando o clique sai de TODO o range.
 */
export function PeriodoRange({ de, ate, onAplicar }: {
  de: string;
  ate: string;
  onAplicar: (de: string, ate: string) => void;
}) {
  const [deP, setDeP] = useState(de);
  const [ateP, setAteP] = useState(ate);
  const ref = useRef<HTMLDivElement>(null);
  const dePRef = useRef(deP);
  const atePRef = useRef(ateP);
  dePRef.current = deP;
  atePRef.current = ateP;

  // Se o valor aplicado mudar de fora (ex.: reset no login), reflete no pendente.
  useEffect(() => { setDeP(de); setAteP(ate); }, [de, ate]);

  // Limpar a data inicial (De) também limpa a final (Até): sem De, o Até fica
  // desabilitado, então não pode sobrar um valor "preso" e sem como editar.
  function mudarDe(v: string) {
    setDeP(v);
    if (v === '') setAteP('');
  }

  // Aplica o filtro só quando o clique sai do range inteiro.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (dePRef.current !== de || atePRef.current !== ate) {
          onAplicar(dePRef.current, atePRef.current);
        }
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [de, ate, onAplicar]);

  return (
    <div ref={ref} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <CampoData
        value={deP}
        onChange={mudarDe}
        onCommit={(v) => onAplicar(v, v === '' ? '' : atePRef.current)}
        max={parseBR(ateP)}
        ariaLabel="Data inicial (De)"
      />
      <span className="text-sm-ui text-neutral-500">até</span>
      <CampoData
        value={ateP}
        onChange={setAteP}
        onCommit={(v) => onAplicar(dePRef.current, v)}
        min={parseBR(deP)}
        disabled={!parseBR(deP)}
        ariaLabel="Data final (Até)"
        title={!parseBR(deP) ? 'Informe primeiro a data inicial (De)' : undefined}
      />
    </div>
  );
}
