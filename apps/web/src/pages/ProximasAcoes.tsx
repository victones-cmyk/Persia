// apps/web/src/pages/ProximasAcoes.tsx
// O que está parado esperando alguém, do orçamento até a baixa de estoque.
//
// Cada etapa do caminho já tinha sua tela e sua consulta de pendências, mas
// espalhadas: pedido sem OS na Produção, baixa de estoque em outra tela, visita
// feita como um aviso na lista de orçamentos, e a aprovação de absorção sem
// tela nenhuma — o endpoint existia e ninguém o consumia. Para saber se havia
// trabalho parado era preciso abrir quatro telas e lembrar de todas.
//
// Aqui não há consulta nova: esta página chama exatamente os mesmos endpoints
// que cada tela já usa, em paralelo, e só mostra o que voltou. Reimplementar as
// regras de "o que está pendente" criaria uma segunda verdade, que um dia
// divergiria da primeira sem ninguém notar.
//
// É triagem, não um fluxo novo: cada cartão leva para a tela que resolve aquilo.
// Nada é executado daqui.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRulerCombined, faCircleCheck, faFileInvoiceDollar, faIndustry,
  faTag, faBoxOpen, faRotateRight, faArrowRight, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { lerFiltrosOrcamento, salvarFiltrosOrcamento } from '../lib/filtrosSessao';

interface Acao {
  chave: string;
  titulo: string;
  icone: IconDefinition;
  total: number;
  /** O que significa estar nesta fila, para quem não conhece o processo. */
  explicacao: string;
  /** O que fazer, e onde. */
  acaoLabel: string;
  ir: () => void;
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function ProximasAcoes() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin';

  const [visitas, setVisitas] = useState(0);
  const [aprovacoes, setAprovacoes] = useState(0);
  const [semOs, setSemOs] = useState(0);
  const [etiquetas, setEtiquetas] = useState(0);
  // A listagem de ordens para em 500 registros. Se vier cheia, a contagem é um
  // piso, não o total — e dizer "500" como se fosse exato seria mentir.
  const [etiquetasNoLimite, setEtiquetasNoLimite] = useState(false);
  const [estoque, setEstoque] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    // Uma fila que falha não pode derrubar as outras: quem está de pé continua
    // aparecendo, e o erro é dito uma vez só no topo.
    const pega = async <T,>(url: string): Promise<T | null> => {
      try { return await api.get<T>(url); } catch { return null; }
    };
    const [v, a, s, o, e] = await Promise.all([
      pega<{ total: number }>('/orcamentos/visitas-pendentes'),
      isAdmin ? pega<{ total: number }>('/orcamentos/producao/aprovacoes-pendentes') : Promise.resolve({ total: 0 }),
      pega<{ total: number }>('/orcamentos/pedidos-sem-os'),
      pega<{ ordens: unknown[] }>('/orcamentos/ordens-producao?status=criada'),
      pega<{ total: number }>('/orcamentos/pendentes-estoque'),
    ]);

    setVisitas(numero(v?.total));
    setAprovacoes(numero(a?.total));
    setSemOs(numero(s?.total));
    const qtdOrdens = Array.isArray(o?.ordens) ? o.ordens.length : 0;
    setEtiquetas(qtdOrdens);
    setEtiquetasNoLimite(qtdOrdens >= 500);
    setEstoque(numero(e?.total));
    if ([v, s, o, e].some((r) => r === null)) {
      setErro('Alguma das listas não carregou. O que aparece abaixo está correto; recarregue para tentar de novo.');
    }
    setCarregando(false);
  }, [isAdmin]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * Leva à lista de orçamentos já filtrada.
   *
   * A lista lê o filtro do sessionStorage, não da URL, então gravar ali é o que
   * faz o link chegar filtrado. Mantém o resto do que estava salvo — quem veio
   * de uma busca não a perde por passar por aqui.
   */
  const irParaOrcamentos = (status: string) => {
    salvarFiltrosOrcamento({ ...(lerFiltrosOrcamento() ?? {}), status, pagina: 1 });
    navigate('/orcamentos');
  };

  const acoes: Acao[] = [
    {
      chave: 'visitas',
      titulo: 'Visitas feitas sem venda',
      icone: faRulerCombined,
      total: visitas,
      // A contagem é mais estreita que o filtro de destino: aqui só entram os
      // que ainda não viraram pedido, enquanto a lista mostra toda visita feita,
      // inclusive as já vendidas. Dizer isso evita a impressão de número errado.
      explicacao: 'O técnico já mediu e o orçamento não virou pedido. É onde se compara o medido com o vendido e, se precisar, se refaz o orçamento. A lista abre com todas as visitas feitas, inclusive as já vendidas.',
      acaoLabel: 'Ver orçamentos com visita feita',
      ir: () => irParaOrcamentos('visita_feita'),
    },
    ...(isAdmin ? [{
      chave: 'aprovacoes',
      titulo: 'Absorções a aprovar',
      icone: faCircleCheck,
      total: aprovacoes,
      explicacao: 'Um vendedor pediu para a empresa absorver a diferença de medida em vez de cobrar do cliente. Sem a sua decisão, o pedido não anda.',
      acaoLabel: 'Ver em Vendas',
      ir: () => navigate('/vendas'),
    }] : []),
    {
      chave: 'sem_os',
      titulo: 'Pedidos sem ordem de produção',
      icone: faFileInvoiceDollar,
      total: semOs,
      explicacao: 'A venda está fechada mas a fábrica ainda não recebeu o que produzir.',
      acaoLabel: 'Ir para Produção',
      ir: () => navigate('/producao'),
    },
    {
      chave: 'etiquetas',
      titulo: 'Etiquetas a imprimir',
      icone: faTag,
      total: etiquetas,
      explicacao: 'Ordens geradas cuja etiqueta ainda não foi impressa. Sem ela a peça circula sem identificação.',
      acaoLabel: 'Ir para Produção',
      ir: () => navigate('/producao'),
    },
    {
      chave: 'estoque',
      titulo: 'Baixa de estoque pendente',
      icone: faBoxOpen,
      total: estoque,
      explicacao: 'Material já usado na produção que continua contado como disponível no GestãoClick.',
      acaoLabel: 'Ir para Baixa de Estoque',
      ir: () => navigate('/baixa-estoque'),
    },
  ];

  const comPendencia = acoes.filter((a) => a.total > 0);
  const semPendencia = acoes.filter((a) => a.total === 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl-ui font-bold text-neutral-800">Próximas ações</h1>
        <button className="btn btn-default btn-sm" disabled={carregando} onClick={() => void carregar()}>
          <FontAwesomeIcon icon={carregando ? faSpinner : faRotateRight} spin={carregando} /> Atualizar
        </button>
      </div>

      {erro && <div className="alert alert-warning mb-4">{erro}</div>}

      {carregando && comPendencia.length === 0 && semPendencia.length === 0 && (
        <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando…</div>
      )}

      {!carregando && comPendencia.length === 0 && (
        <div className="alert alert-success">
          <FontAwesomeIcon icon={faCircleCheck} /> Nada parado esperando alguém. Todo pedido enviado já tem
          ordem de produção, etiqueta impressa e estoque baixado.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {comPendencia.map((a) => (
          <div
            key={a.chave}
            className="card"
            style={{
              border: '1px solid var(--color-warning-border)',
              background: 'var(--color-warning-subtle)',
              borderRadius: 3,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                {a.chave === 'etiquetas' && etiquetasNoLimite ? '500+' : a.total}
              </span>
              <span className="text-md-ui font-bold text-neutral-800">
                <FontAwesomeIcon icon={a.icone} className="text-neutral-500" /> {a.titulo}
              </span>
            </div>
            <p className="text-sm-ui text-neutral-700" style={{ margin: 0, flex: 1 }}>{a.explicacao}</p>
            <button className="btn btn-default btn-sm" style={{ alignSelf: 'flex-start' }} onClick={a.ir}>
              {a.acaoLabel} <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </div>
        ))}
      </div>

      {semPendencia.length > 0 && (
        <div className="mt-4">
          <div className="text-xs-ui uppercase text-neutral-500 mb-2">Sem pendências</div>
          <div className="flex flex-wrap gap-2">
            {semPendencia.map((a) => (
              <span key={a.chave} className="badge" style={{ borderColor: 'var(--neutral-300)', color: 'var(--neutral-600)' }}>
                <FontAwesomeIcon icon={faCircleCheck} /> {a.titulo}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="helper-text mt-4">
        <FontAwesomeIcon icon={faIndustry} className="text-neutral-400" /> Esta tela só mostra e encaminha —
        imprimir etiqueta e dar baixa continuam sendo feitos na tela de cada etapa, com confirmação.
      </p>
    </div>
  );
}
