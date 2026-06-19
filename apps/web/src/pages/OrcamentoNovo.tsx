// apps/web/src/pages/OrcamentoNovo.tsx
// Novo orçamento (SRD §8): seleção de tipo → formulário + resultado.
// - EDIÇÃO de rascunho (?editar=<id>): reabre a calculadora pré-preenchida (dados do banco).
// - AUTOSAVE LOCAL: enquanto preenche, salva no navegador; se fechar/recarregar sem querer,
//   recupera ao voltar (ver lib/rascunhoLocal). Não vale para o modo edição.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScroll, faLayerGroup, faTriangleExclamation, faSpinner, faXmark, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useAuth } from '../hooks/useAuth';
import { useGcHealth } from '../hooks/useGcHealth';
import { useToast } from '../hooks/useToast';
import { useNavGuard } from '../hooks/useNavGuard';
import { api } from '../lib/api';
import { PersianaForm } from '../components/PersianaForm';
import { ResultadoPanel } from '../components/ResultadoPanel';
import { CortinaOrcamento } from '../components/CortinaOrcamento';
import { ClienteSearch } from '../components/ClienteSearch';
import type { CortinaInicial } from '../components/CortinaCard';
import type { OrcamentoCalculado, ClienteResumo, ItemInput, TipoPersiana, Cor, Acionamento } from '../lib/calcTypes';
import type { OrcamentoDetalhe, ItemSnapshot } from '../lib/orcamentoTypes';
import {
  lerRascunhoLocal, salvarRascunhoLocal, limparRascunhoLocal,
  type PersianaSnapshot, type CortinaSnapshot, type RascunhoLocal,
} from '../lib/rascunhoLocal';

type TipoProduto = 'persiana' | 'cortina' | null;

interface PersianaInicial { tipo: TipoPersiana; itens: ItemInput[] }
interface CortinaInicialOrc { cortinas: CortinaInicial[]; instalacao_valor: number }

export function OrcamentoNovo() {
  const { usuario } = useAuth();
  const { status: gcStatus } = useGcHealth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setDirty } = useNavGuard();
  const [params] = useSearchParams();
  const editarId = params.get('editar');

  // Rascunho local recuperado (só fora do modo edição), lido uma vez no início.
  const [rascunhoLocal] = useState<RascunhoLocal | null>(() => (editarId ? null : lerRascunhoLocal()));

  const [tipoProduto, setTipoProduto] = useState<TipoProduto>(rascunhoLocal?.tipo ?? null);
  const [resultado, setResultado] = useState<OrcamentoCalculado | null>(null);
  const [cliente, setCliente] = useState<ClienteResumo | null>(
    rascunhoLocal?.cliente ? { id: rascunhoLocal.cliente.id, nome: rascunhoLocal.cliente.nome, tipo_pessoa: '', documento: null } : null,
  );
  const [recuperado, setRecuperado] = useState(!!rascunhoLocal);

  // Edição de rascunho (do banco): carrega antes de montar o formulário.
  const [carregandoEdicao, setCarregandoEdicao] = useState(!!editarId);
  const [prontoEdicao, setProntoEdicao] = useState(!editarId);
  const [persianaInicial, setPersianaInicial] = useState<PersianaInicial | undefined>();
  const [persianaInstalacao, setPersianaInstalacao] = useState<number | undefined>();
  const [cortinaInicial, setCortinaInicial] = useState<CortinaInicialOrc | undefined>();

  // Refs para o autosave (sem causar re-render a cada tecla).
  const snapRef = useRef<PersianaSnapshot | CortinaSnapshot | null>(rascunhoLocal?.persiana ?? rascunhoLocal?.cortina ?? null);
  const sujoRef = useRef(!!rascunhoLocal);
  const clienteRef = useRef(cliente); clienteRef.current = cliente;
  const tipoRef = useRef(tipoProduto); tipoRef.current = tipoProduto;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agendarSalvar = useCallback(() => {
    if (editarId) return; // em edição não há autosave local
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const tp = tipoRef.current;
      const snap = snapRef.current;
      if (!tp || !sujoRef.current || !snap) { limparRascunhoLocal(); return; }
      const cli = clienteRef.current;
      const r: RascunhoLocal = {
        tipo: tp,
        cliente: cli ? { id: cli.id, nome: cli.nome } : null,
        ts: Date.now(),
        ...(tp === 'persiana' ? { persiana: snap as PersianaSnapshot } : { cortina: snap as CortinaSnapshot }),
      };
      salvarRascunhoLocal(r);
    }, 500);
  }, [editarId]);

  const onSnapPersiana = useCallback((s: PersianaSnapshot) => { snapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const onSnapCortina = useCallback((s: CortinaSnapshot) => { snapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const onDirty = useCallback((sujo: boolean) => { sujoRef.current = sujo; setDirty(sujo); agendarSalvar(); }, [agendarSalvar, setDirty]);
  const onSelecionarCliente = useCallback((c: ClienteResumo | null) => { setCliente(c); agendarSalvar(); }, [agendarSalvar]);

  useEffect(() => {
    if (!editarId) return;
    let vivo = true;
    (async () => {
      try {
        const r = await api.get<{ orcamento: OrcamentoDetalhe }>(`/orcamentos/${editarId}`);
        if (!vivo) return;
        const o = r.orcamento;
        if (o.status !== 'rascunho') {
          showToast('error', 'Edição indisponível', 'Só é possível editar orçamentos em rascunho.');
          navigate(`/orcamentos/${editarId}`);
          return;
        }
        setCliente(o.gc_cliente_id ? { id: o.gc_cliente_id, nome: o.nome_cliente, tipo_pessoa: '', documento: null } : null);
        const ehCortina = o.tipo_produto === 'cortina';
        setTipoProduto(ehCortina ? 'cortina' : 'persiana');
        const entrada = (o.entrada_json ?? null) as { itens?: ItemInput[]; cortinas?: CortinaInicial[]; instalacao_valor?: number } | null;

        if (ehCortina) {
          if (entrada?.cortinas && entrada.cortinas.length > 0) {
            setCortinaInicial({ cortinas: entrada.cortinas, instalacao_valor: Number(entrada.instalacao_valor) || 0 });
          } else {
            showToast('error', 'Rascunho antigo', 'Este rascunho não tem dados para reabrir na calculadora. Crie um novo orçamento.');
            navigate(`/orcamentos/${editarId}`);
            return;
          }
        } else {
          setPersianaInstalacao(Number(entrada?.instalacao_valor) || undefined);
          if (entrada?.itens && entrada.itens.length > 0) {
            setPersianaInicial({ tipo: o.tipo_produto as TipoPersiana, itens: entrada.itens });
          } else if (o.itens_json && o.itens_json.length > 0) {
            setPersianaInicial({
              tipo: o.tipo_produto as TipoPersiana,
              itens: o.itens_json.map((s: ItemSnapshot) => ({
                tecido_id: s.tecido_codigo_gc,
                cor_acessorio: s.cor_acessorio as Cor,
                acionamento: s.acionamento as Acionamento,
                largura: Number(s.largura_m),
                altura: Number(s.altura_m),
                tc: Number(s.tc_m),
                rolamento: s.rolamento,
                base: s.base,
              })),
            });
          } else {
            showToast('error', 'Rascunho sem itens', 'Não há itens para reabrir na calculadora.');
            navigate(`/orcamentos/${editarId}`);
            return;
          }
        }
        setProntoEdicao(true);
      } catch {
        if (vivo) {
          showToast('error', 'Não foi possível abrir o orçamento para edição.');
          navigate('/orcamentos');
        }
      } finally {
        if (vivo) setCarregandoEdicao(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId]);

  function escolher(tp: 'persiana' | 'cortina') {
    setTipoProduto(tp);
    setResultado(null);
    // Troca de tipo reinicia o orçamento e descarta o autosave anterior.
    snapRef.current = null;
    sujoRef.current = false;
    setRecuperado(false);
    setDirty(false);
    limparRascunhoLocal();
  }

  function descartarRecuperado() {
    limparRascunhoLocal();
    snapRef.current = null;
    sujoRef.current = false;
    setDirty(false);
    // Recarrega a tela limpa (forma simples e segura de zerar os formulários).
    window.location.assign('/orcamentos/novo');
  }

  function aoEnviado(orc: { status: string }) {
    if (orc.status === 'enviado' || orc.status === 'rascunho') {
      limparRascunhoLocal();
      sujoRef.current = false;
      setDirty(false);
      navigate('/orcamentos');
    }
  }

  // Ao sair da tela (desmontar), libera a guarda e cancela o timer pendente.
  useEffect(() => () => { setDirty(false); if (timerRef.current) clearTimeout(timerRef.current); }, [setDirty]);

  if (editarId && carregandoEdicao) {
    return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando orçamento…</div>;
  }

  return (
    <div>
      <h1 className="text-2xl-ui font-bold text-neutral-800 mb-4">{editarId ? 'Editar Orçamento' : 'Novo Orçamento'}</h1>

      {/* Banner de edição + cancelar edição (não cancela o orçamento) */}
      {editarId && (
        <div className="alert alert-info mb-4 flex items-center justify-between gap-3">
          <span>Editando um rascunho. Altere o que precisar e use <strong>Salvar</strong> ou <strong>Enviar</strong> — o mesmo orçamento será atualizado.</span>
          <button className="btn btn-default btn-xs" onClick={() => navigate(`/orcamentos/${editarId}`)}>
            <FontAwesomeIcon icon={faXmark} /> Cancelar edição
          </button>
        </div>
      )}

      {/* Banner de recuperação do autosave local */}
      {!editarId && recuperado && (
        <div className="alert alert-warning mb-4 flex items-center justify-between gap-3">
          <span>Recuperamos um orçamento que você não chegou a salvar. Continue de onde parou ou descarte para começar do zero.</span>
          <button className="btn btn-default btn-xs" onClick={descartarRecuperado}>
            <FontAwesomeIcon icon={faRotateLeft} /> Descartar e começar novo
          </button>
        </div>
      )}

      {/* RN: vendedor sem vínculo no GestãoClick (PLACEHOLDER-02) */}
      {usuario && !usuario.gc_usuario_id && (
        <div className="alert alert-warning max-w-form mb-4">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <div>
            <div className="font-semibold">Usuário sem vendedor vinculado</div>
            <div className="text-xs-ui opacity-85">
              Você pode enviar normalmente, mas o orçamento sairá sem vendedor no GestãoClick.
              Um admin pode vincular seu vendedor em Administração → Usuários.
            </div>
          </div>
        </div>
      )}

      {/* Etapa 1 — Seleção de tipo (somente em novo orçamento; na edição o tipo é fixo) */}
      {!editarId && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <CardTipo icon={faScroll} titulo="Persiana" selecionado={tipoProduto === 'persiana'} onClick={() => escolher('persiana')} />
          <CardTipo icon={faLayerGroup} titulo="Cortina" selecionado={tipoProduto === 'cortina'} onClick={() => escolher('cortina')} />
        </div>
      )}

      {/* Cliente — no topo (padrão GestãoClick). Obrigatório só para enviar ao GC. */}
      {tipoProduto && (
        <div className="card p-4 mb-4">
          <label className="form-label">Cliente <span className="label-optional">(obrigatório para enviar ao GestãoClick)</span></label>
          <ClienteSearch selecionado={cliente} onSelecionar={onSelecionarCliente} />
        </div>
      )}

      {/* Etapa 2 — Cortina (modelo "+": vários ambientes + camadas) */}
      {tipoProduto === 'cortina' && prontoEdicao && (
        <CortinaOrcamento
          cliente={cliente}
          gcStatus={gcStatus}
          gcUsuarioId={usuario?.gc_usuario_id ?? null}
          inicial={cortinaInicial}
          restauro={rascunhoLocal?.cortina}
          editarId={editarId}
          onDirtyChange={onDirty}
          onSnapshot={onSnapCortina}
          onEnviado={aoEnviado}
        />
      )}

      {/* Etapa 2 — Persiana */}
      {tipoProduto === 'persiana' && prontoEdicao && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <PersianaForm onResult={setResultado} inicial={persianaInicial} restauro={rascunhoLocal?.persiana} onDirtyChange={onDirty} onSnapshot={onSnapPersiana} />
          </div>
          <div className="lg:col-span-1">
            <ResultadoPanel
              dados={resultado}
              cliente={cliente}
              gcStatus={gcStatus}
              gcUsuarioId={usuario?.gc_usuario_id ?? null}
              editarId={editarId}
              instalacaoInicial={persianaInstalacao}
              onEnviado={aoEnviado}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CardTipo({
  icon,
  titulo,
  selecionado,
  onClick,
}: {
  icon: IconDefinition;
  titulo: string;
  selecionado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-6 text-center transition flex flex-col items-center gap-3"
      style={{
        borderColor: selecionado ? 'var(--action-add)' : 'var(--neutral-300)',
        background: selecionado ? '#f4fff9' : 'var(--surface-card)',
      }}
    >
      <FontAwesomeIcon icon={icon} size="2x" style={{ color: 'var(--neutral-700)' }} />
      <div className="text-xl-ui font-semibold text-neutral-800">{titulo}</div>
    </button>
  );
}
