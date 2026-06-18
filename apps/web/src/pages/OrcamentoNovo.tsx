// apps/web/src/pages/OrcamentoNovo.tsx
// Novo orçamento (SRD §8): seleção de tipo → formulário + resultado.
// Também atende a EDIÇÃO de rascunho (?editar=<id>): reabre a calculadora inteira
// pré-preenchida com os dados salvos; ao salvar/enviar, regrava no mesmo registro.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScroll, faLayerGroup, faTriangleExclamation, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons';
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

  const [tipoProduto, setTipoProduto] = useState<TipoProduto>(null);
  const [resultado, setResultado] = useState<OrcamentoCalculado | null>(null);
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);

  // Edição de rascunho: carrega os dados antes de montar o formulário.
  const [carregandoEdicao, setCarregandoEdicao] = useState(!!editarId);
  const [prontoEdicao, setProntoEdicao] = useState(!editarId);
  const [persianaInicial, setPersianaInicial] = useState<PersianaInicial | undefined>();
  const [cortinaInicial, setCortinaInicial] = useState<CortinaInicialOrc | undefined>();

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
          if (entrada?.itens && entrada.itens.length > 0) {
            setPersianaInicial({ tipo: o.tipo_produto as TipoPersiana, itens: entrada.itens });
          } else if (o.itens_json && o.itens_json.length > 0) {
            // Fallback p/ rascunhos salvos antes do entrada_json: reconstrói do snapshot.
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
    setDirty(false); // troca de tipo reinicia o formulário
  }

  // Ao sair da tela (desmontar), libera a guarda de navegação.
  useEffect(() => () => setDirty(false), [setDirty]);

  if (editarId && carregandoEdicao) {
    return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando orçamento…</div>;
  }

  return (
    <div>
      <h1 className="text-2xl-ui mb-4">{editarId ? 'Editar Orçamento' : 'Novo Orçamento'}</h1>

      {/* Banner de edição + cancelar edição (não cancela o orçamento) */}
      {editarId && (
        <div className="alert alert-info mb-4 flex items-center justify-between gap-3">
          <span>Editando um rascunho. Altere o que precisar e use <strong>Salvar</strong> ou <strong>Enviar</strong> — o mesmo orçamento será atualizado.</span>
          <button className="btn btn-default btn-xs" onClick={() => navigate(`/orcamentos/${editarId}`)}>
            <FontAwesomeIcon icon={faXmark} /> Cancelar edição
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
          <CardTipo
            icon={faScroll}
            titulo="Persiana"
            selecionado={tipoProduto === 'persiana'}
            onClick={() => escolher('persiana')}
          />
          <CardTipo
            icon={faLayerGroup}
            titulo="Cortina"
            selecionado={tipoProduto === 'cortina'}
            onClick={() => escolher('cortina')}
          />
        </div>
      )}

      {/* Cliente — no topo (padrão GestãoClick). Obrigatório só para enviar ao GC. */}
      {tipoProduto && (
        <div className="card p-4 mb-4">
          <label className="form-label">Cliente <span className="label-optional">(obrigatório para enviar ao GestãoClick)</span></label>
          <ClienteSearch selecionado={cliente} onSelecionar={setCliente} />
        </div>
      )}

      {/* Etapa 2 — Cortina (modelo "+": vários ambientes + camadas) */}
      {tipoProduto === 'cortina' && prontoEdicao && (
        <CortinaOrcamento
          cliente={cliente}
          gcStatus={gcStatus}
          gcUsuarioId={usuario?.gc_usuario_id ?? null}
          inicial={cortinaInicial}
          editarId={editarId}
          onDirtyChange={setDirty}
          onEnviado={(orc) => {
            if (orc.status === 'enviado' || orc.status === 'rascunho') navigate('/orcamentos');
          }}
        />
      )}

      {/* Etapa 2 — Persiana */}
      {tipoProduto === 'persiana' && prontoEdicao && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <PersianaForm onResult={setResultado} inicial={persianaInicial} onDirtyChange={setDirty} />
          </div>
          <div className="lg:col-span-1">
            <ResultadoPanel
              dados={resultado}
              cliente={cliente}
              gcStatus={gcStatus}
              gcUsuarioId={usuario?.gc_usuario_id ?? null}
              editarId={editarId}
              onEnviado={(orc) => {
                if (orc.status === 'enviado' || orc.status === 'rascunho') navigate('/orcamentos');
              }}
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
