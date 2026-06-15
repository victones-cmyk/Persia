// apps/web/src/pages/OrcamentoNovo.tsx
// Novo orçamento (SRD §8): seleção de tipo → formulário + resultado.
// Cortina exibe alert-warning (BLOQUEANTE-02). Persiana: form + painel sticky.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScroll, faLayerGroup, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useAuth } from '../hooks/useAuth';
import { useGcHealth } from '../hooks/useGcHealth';
import { PersianaForm } from '../components/PersianaForm';
import { ResultadoPanel } from '../components/ResultadoPanel';
import { CortinaForm } from '../components/CortinaForm';
import { CortinaResultado } from '../components/CortinaResultado';
import { ClienteSearch } from '../components/ClienteSearch';
import type { OrcamentoCalculado, ClienteResumo } from '../lib/calcTypes';
import type { CalcularCortinaResposta } from '../lib/cortinaTypes';

type TipoProduto = 'persiana' | 'cortina' | null;

export function OrcamentoNovo() {
  const { usuario } = useAuth();
  const { status: gcStatus } = useGcHealth();
  const navigate = useNavigate();
  const [tipoProduto, setTipoProduto] = useState<TipoProduto>(null);
  const [resultado, setResultado] = useState<OrcamentoCalculado | null>(null);
  const [cortina, setCortina] = useState<CalcularCortinaResposta | null>(null);
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);

  function escolher(tp: 'persiana' | 'cortina') {
    setTipoProduto(tp);
    setResultado(null);
    setCortina(null);
  }

  return (
    <div>
      <h1 className="text-2xl-ui mb-4">Novo Orçamento</h1>

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

      {/* Etapa 1 — Seleção de tipo */}
      <div className="grid grid-cols-2 gap-4 max-w-form mb-6">
        <CardTipo
          icon={faScroll}
          titulo="Persiana"
          descricao="7 tipos (rolo e romana)"
          selecionado={tipoProduto === 'persiana'}
          onClick={() => escolher('persiana')}
        />
        <CardTipo
          icon={faLayerGroup}
          titulo="Cortina"
          descricao="15 tipos sob medida"
          selecionado={tipoProduto === 'cortina'}
          onClick={() => escolher('cortina')}
        />
      </div>

      {/* Cliente — no topo (padrão GestãoClick). Obrigatório só para enviar ao GC. */}
      {tipoProduto && (
        <div className="card p-4 max-w-form mb-4">
          <label className="form-label">Cliente <span className="label-optional">(obrigatório para enviar)</span></label>
          <ClienteSearch selecionado={cliente} onSelecionar={setCliente} />
        </div>
      )}

      {/* Etapa 2 — Cortina (Fase 7: calculadora; modelos Ilhós/Prega/Franzido/Wave) */}
      {tipoProduto === 'cortina' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <CortinaForm onResult={setCortina} />
          </div>
          <div className="lg:col-span-1">
            {cortina ? (
              <CortinaResultado dados={cortina} />
            ) : (
              <div className="card p-4 text-sm-ui text-neutral-500 max-w-form" style={{ position: 'sticky', top: 'calc(50px + 16px)' }}>
                Preencha os dados e clique em <strong>Calcular</strong> para ver o resultado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Etapa 2 — Persiana */}
      {tipoProduto === 'persiana' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <PersianaForm onResult={setResultado} />
          </div>
          <div className="lg:col-span-1">
            {resultado ? (
              <ResultadoPanel
                dados={resultado}
                cliente={cliente}
                descontoMaxPct={usuario?.desconto_max_pct ?? 0}
                gcStatus={gcStatus}
                gcUsuarioId={usuario?.gc_usuario_id ?? null}
                onEnviado={(orc) => {
                  if (orc.status === 'enviado' || orc.status === 'rascunho') navigate('/orcamentos');
                }}
              />
            ) : (
              <div className="card p-4 text-sm-ui text-neutral-500 max-w-form" style={{ position: 'sticky', top: 'calc(50px + 16px)' }}>
                Preencha os dados e clique em <strong>Calcular</strong> para ver o resultado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardTipo({
  icon,
  titulo,
  descricao,
  selecionado,
  onClick,
}: {
  icon: IconDefinition;
  titulo: string;
  descricao: string;
  selecionado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-4 text-center transition"
      style={{
        borderColor: selecionado ? 'var(--action-add)' : 'var(--neutral-300)',
        background: selecionado ? '#f4fff9' : 'var(--surface-card)',
      }}
    >
      <FontAwesomeIcon icon={icon} size="lg" className="mb-2" style={{ color: 'var(--neutral-700)' }} />
      <div className="text-md-ui font-semibold text-neutral-800">{titulo}</div>
      <div className="text-xs-ui text-neutral-500">{descricao}</div>
    </button>
  );
}
