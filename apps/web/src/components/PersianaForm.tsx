// apps/web/src/components/PersianaForm.tsx
// Formulário de persiana (SRD §8 Etapa 2A). Tecidos do mock (Fase 4 → GestãoClick).
// TC auto-preenchido (70% da altura) mas EDITÁVEL (RN-04). RN-01 com chips de alternativos.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCalculator } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { roundHalfUp } from '../lib/formatacao';
import {
  TIPOS_PERSIANA,
  CORES,
  ACIONAMENTOS,
  ROLAMENTOS,
  type TipoPersiana,
  type Cor,
  type Acionamento,
  type TecidoOpcao,
  type CalcularResposta,
  type RN01Resposta,
  type PersianaInputs,
} from '../lib/calcTypes';

interface Alternativo {
  id: string;
  nome: string;
  dimensao_m: number;
}

export function PersianaForm({
  onResult,
}: {
  onResult: (dados: CalcularResposta | null, inputs: PersianaInputs | null) => void;
}) {
  const [tipo, setTipo] = useState<TipoPersiana | ''>('');
  const [cor, setCor] = useState<Cor | ''>('');
  const [acionamento, setAcionamento] = useState<Acionamento | ''>('');
  const [tecidoId, setTecidoId] = useState('');
  const [largura, setLargura] = useState('');
  const [altura, setAltura] = useState('');
  const [tc, setTc] = useState('');
  const [tcManual, setTcManual] = useState(false);
  const [rolamento, setRolamento] = useState('');
  const [base, setBase] = useState('');
  const [mesmoAmbiente, setMesmoAmbiente] = useState(false);

  const [tecidos, setTecidos] = useState<TecidoOpcao[]>([]);
  const [carregandoTecidos, setCarregandoTecidos] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [larguraErro, setLarguraErro] = useState<string | null>(null);
  const [alternativos, setAlternativos] = useState<Alternativo[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  // Recarrega tecidos quando o tipo muda (SRD §8: "ao mudar recarrega Coleção").
  useEffect(() => {
    if (!tipo) {
      setTecidos([]);
      return;
    }
    setCarregandoTecidos(true);
    setTecidoId('');
    api
      .get<{ tecidos: TecidoOpcao[] }>(`/calcular/tecidos?tipo=${tipo}`)
      .then((r) => setTecidos(r.tecidos))
      .catch(() => setTecidos([]))
      .finally(() => setCarregandoTecidos(false));
  }, [tipo]);

  // TC auto = 70% da altura, até o vendedor editar manualmente (RN-04).
  function onAlturaChange(v: string) {
    setAltura(v);
    const a = Number(v);
    if (!tcManual && a > 0) setTc(String(roundHalfUp(a * 0.7)));
  }

  const formValido =
    tipo !== '' &&
    cor !== '' &&
    acionamento !== '' &&
    tecidoId !== '' &&
    Number(largura) > 0 &&
    Number(altura) > 0;

  async function calcular() {
    if (!formValido || calculando) return;
    setCalculando(true);
    setLarguraErro(null);
    setAlternativos([]);
    setErroGeral(null);
    try {
      const dados = await api.post<CalcularResposta>('/calcular/persiana', {
        tipo,
        largura: Number(largura),
        altura: Number(altura),
        cor_acessorio: cor,
        acionamento,
        tc: tc === '' ? undefined : Number(tc),
        tecido_id: tecidoId,
      });
      onResult(dados, {
        tipo: tipo as TipoPersiana,
        largura: Number(largura),
        altura: Number(altura),
        cor_acessorio: cor as Cor,
        acionamento: acionamento as Acionamento,
        tc: tc === '' ? undefined : Number(tc),
        rolamento: rolamento || undefined,
        tecido_id: tecidoId,
      });
    } catch (e) {
      onResult(null, null);
      if (e instanceof ApiError && e.status === 422) {
        const d = e.data as RN01Resposta;
        setLarguraErro(d.message);
        setAlternativos(d.alternativos ?? []);
      } else {
        setErroGeral('Não foi possível calcular. Tente novamente.');
      }
    } finally {
      setCalculando(false);
    }
  }

  function escolherAlternativo(a: Alternativo) {
    setTecidoId(a.id);
    setLarguraErro(null);
    setAlternativos([]);
  }

  return (
    <div className="card p-4 max-w-form">
      <h4 className="text-lg-ui font-medium mb-4">Dados da Persiana</h4>

      <div className="space-y-4">
        {/* Produto Sob Medida */}
        <Campo id="f-tipo" label="Produto Sob Medida" obrigatorio>
          <select id="f-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPersiana)}>
            <option value="">Selecione…</option>
            {TIPOS_PERSIANA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Campo>

        {/* Coleção (Tecido) */}
        <Campo id="f-tecido" label="Coleção (Tecido)" obrigatorio>
          {carregandoTecidos ? (
            <div className="skeleton" style={{ height: 38 }} />
          ) : (
            <select
              id="f-tecido"
              className="input"
              value={tecidoId}
              disabled={!tipo}
              onChange={(e) => setTecidoId(e.target.value)}
            >
              <option value="">{tipo ? 'Selecione o tecido…' : 'Escolha o produto primeiro'}</option>
              {tecidos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} — {t.dimensao_m.toFixed(2)}m
                </option>
              ))}
            </select>
          )}
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo id="f-cor" label="Cor Acessório" obrigatorio>
            <select id="f-cor" className="input" value={cor} onChange={(e) => setCor(e.target.value as Cor)}>
              <option value="">Selecione…</option>
              {CORES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>

          <Campo id="f-acionamento" label="Acionamento" obrigatorio>
            <select
              id="f-acionamento"
              className="input"
              value={acionamento}
              onChange={(e) => setAcionamento(e.target.value as Acionamento)}
            >
              <option value="">Selecione…</option>
              {ACIONAMENTOS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Campo id="f-largura" label="Largura (m)" obrigatorio>
            <input
              id="f-largura"
              type="number"
              className={larguraErro ? 'input input-error' : 'input'}
              min={0}
              step={0.01}
              value={largura}
              onChange={(e) => {
                setLargura(e.target.value);
                setLarguraErro(null);
              }}
            />
          </Campo>
          <Campo id="f-altura" label="Altura (m)" obrigatorio>
            <input
              id="f-altura"
              type="number"
              className="input"
              min={0}
              step={0.01}
              value={altura}
              onChange={(e) => onAlturaChange(e.target.value)}
            />
          </Campo>
          <Campo id="f-tc" label="TC (m)">
            <input
              id="f-tc"
              type="number"
              className="input"
              min={0.01}
              step={0.01}
              value={tc}
              onChange={(e) => {
                setTc(e.target.value);
                setTcManual(true);
              }}
              title="Pré-calculado como 70% da altura, mas editável (RN-04)"
            />
          </Campo>
        </div>

        {/* RN-01: alerta de largura máxima + chips de alternativos */}
        {larguraErro && (
          <div style={{ padding: '10px 12px', background: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)', borderRadius: 4, color: '#721c24' }}>
            <div className="text-xs-ui font-semibold">{larguraErro}</div>
            {alternativos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs-ui">Tecidos compatíveis:</span>
                {alternativos.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => escolherAlternativo(a)}
                    style={{ padding: '4px 10px', border: '1px solid var(--action-add)', borderRadius: 3, fontSize: 12, color: 'var(--action-add)', background: 'transparent' }}
                  >
                    {a.nome} ({a.dimensao_m.toFixed(2)}m)
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Campo id="f-rolamento" label="Rolamento" obrigatorio>
            <select id="f-rolamento" className="input" value={rolamento} onChange={(e) => setRolamento(e.target.value)}>
              <option value="">Selecione…</option>
              {ROLAMENTOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="f-base" label="Base">
            <select id="f-base" className="input" value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="">Selecione…</option>
              {CORES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-md-ui">
          <input
            type="checkbox"
            checked={mesmoAmbiente}
            onChange={(e) => setMesmoAmbiente(e.target.checked)}
            style={{ accentColor: 'var(--action-add)' }}
          />
          Mesmo Ambiente
        </label>

        {erroGeral && <div className="helper-error">{erroGeral}</div>}

        <button
          type="button"
          className="btn btn-success w-full"
          disabled={!formValido || calculando}
          aria-disabled={!formValido || calculando}
          onClick={calcular}
        >
          {calculando ? (
            <FontAwesomeIcon icon={faSpinner} spin />
          ) : (
            <>
              <FontAwesomeIcon icon={faCalculator} /> Calcular
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Campo({
  id,
  label,
  obrigatorio,
  children,
}: {
  id: string;
  label: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="form-label" htmlFor={id}>
        {label}
        {obrigatorio && <span className="label-required">*</span>}
      </label>
      {children}
    </div>
  );
}
