// apps/web/src/components/AgendaImprimirBotoes.tsx
// Atalhos de impressão das OS do Agenda vinculadas a uma venda: um ícone por
// tipo (medição / instalação / retorno-garantia), só quando existe evento
// daquele tipo. Com uma única OS imprime direto; com várias abre um menu para
// escolher qual. O PDF é gerado pelo próprio Agenda (rota ?os=<id>&imprimir=1).

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRulerCombined, faScrewdriverWrench, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { EventoAgenda } from './AgendaVinculo';

interface Grupo {
  chave: 'medicao' | 'instalacao' | 'retorno';
  label: string;
  icone: IconDefinition;
  eventos: EventoAgenda[];
}

const TIPO_LABEL: Record<string, string> = {
  measurement: 'Medição',
  installation: 'Instalação',
  return: 'Retorno',
  warranty: 'Garantia',
};

function agrupar(eventos: EventoAgenda[]): Grupo[] {
  const medicao = eventos.filter((e) => e.tipo === 'measurement');
  const instalacao = eventos.filter((e) => e.tipo === 'installation');
  // Retorno e garantia caem no mesmo atalho (ambos são "voltar ao cliente");
  // o menu diferencia quando há mais de um.
  const retorno = eventos.filter((e) => e.tipo === 'return' || e.tipo === 'warranty');
  const grupos: Grupo[] = [
    { chave: 'medicao', label: 'Medição', icone: faRulerCombined, eventos: medicao },
    { chave: 'instalacao', label: 'Instalação', icone: faScrewdriverWrench, eventos: instalacao },
    { chave: 'retorno', label: 'Retorno/Garantia', icone: faRotateLeft, eventos: retorno },
  ];
  return grupos.filter((g) => g.eventos.length > 0);
}

function dataCurta(v: string | null): string {
  if (!v) return 'sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(v));
}

function abrirImpressao(agendaBaseUrl: string, id: number) {
  window.open(`${agendaBaseUrl.replace(/\/$/, '')}/?os=${id}&imprimir=1`, '_blank', 'noopener,noreferrer');
}

export function AgendaImprimirBotoes({ eventos, agendaBaseUrl }: { eventos: EventoAgenda[]; agendaBaseUrl: string }) {
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuAberto(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuAberto]);

  const grupos = agrupar(eventos);
  if (grupos.length === 0) return null;

  return (
    <span ref={boxRef} style={{ position: 'relative', display: 'inline-flex', gap: 'inherit' }}>
      {grupos.map((grupo) => (
        <span key={grupo.chave} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            className="btn btn-default btn-xs"
            title={grupo.eventos.length === 1
              ? `Imprimir OS de ${grupo.label.toLowerCase()} (#${grupo.eventos[0].id})`
              : `${grupo.eventos.length} OS de ${grupo.label.toLowerCase()} — escolher qual imprimir`}
            onClick={() => {
              if (grupo.eventos.length === 1) {
                abrirImpressao(agendaBaseUrl, grupo.eventos[0].id);
                return;
              }
              setMenuAberto((atual) => (atual === grupo.chave ? null : grupo.chave));
            }}
          >
            <FontAwesomeIcon icon={grupo.icone} />
            {grupo.eventos.length > 1 && <span className="text-2xs-ui ml-1">{grupo.eventos.length}</span>}
          </button>

          {menuAberto === grupo.chave && (
            <div
              className="bg-surface-card border border-neutral-300 rounded-sm"
              style={{ position: 'absolute', top: '100%', right: 0, marginTop: 2, zIndex: 30, minWidth: 210, boxShadow: 'var(--shadow-dropdown)' }}
              role="menu"
            >
              {grupo.eventos.map((evento) => (
                <button
                  key={evento.id}
                  type="button"
                  role="menuitem"
                  className="block w-full text-left px-3 py-2 text-xs-ui border-b border-neutral-200 hover:bg-neutral-100"
                  onClick={() => {
                    abrirImpressao(agendaBaseUrl, evento.id);
                    setMenuAberto(null);
                  }}
                >
                  <span className="text-neutral-800">{TIPO_LABEL[evento.tipo] ?? evento.tipo} · {dataCurta(evento.agendado_para)}</span>
                  <span className="block text-neutral-500">
                    OS #{evento.id}{evento.instalador_nome ? ` · ${evento.instalador_nome}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </span>
      ))}
    </span>
  );
}
