// apps/web/src/components/CortinaForm.tsx
// Formulário da calculadora de CORTINA (Fase 7) — modelos Ilhós/Prega/Franzido/Wave.
// Calcula metragem de tecido + lista de itens. Envio ao GestãoClick virá depois
// (depende do mapeamento de acessórios → produtos do GC).

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCalculator } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { TecidoSearch } from './TecidoSearch';
import type { TecidoOpcao } from '../lib/calcTypes';
import {
  MODELOS_CORTINA,
  FIXACOES_CORTINA,
  CONFIGS_CORTINA,
  FIXACOES_POR_MODELO,
  type ModeloCortina,
  type FixacaoCortina,
  type ConfigTecidoCortina,
  type CalcularCortinaResposta,
} from '../lib/cortinaTypes';

export function CortinaForm({ onResult }: { onResult: (r: CalcularCortinaResposta | null) => void }) {
  const [modelo, setModelo] = useState<ModeloCortina>('ilhos');
  const [fixacao, setFixacao] = useState<FixacaoCortina>('varao');
  const [config, setConfig] = useState<ConfigTecidoCortina>('um_tecido');
  const [largura, setLargura] = useState('');
  const [altura, setAltura] = useState('');
  const [franzidoFrente, setFranzidoFrente] = useState('3');
  const [franzidoTras, setFranzidoTras] = useState('2');
  const [tamanhoBarra, setTamanhoBarra] = useState('0.10');
  const [tipoBarra, setTipoBarra] = useState<'simples' | 'dupla'>('dupla');
  const [aberturas, setAberturas] = useState('1');
  const [tecidoFrenteId, setTecidoFrenteId] = useState('');
  const [tecidoTrasId, setTecidoTrasId] = useState('');

  const [tecidos, setTecidos] = useState<TecidoOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carrega os tecidos de cortina uma vez.
  useEffect(() => {
    setCarregando(true);
    api
      .get<{ tecidos: TecidoOpcao[] }>('/calcular/cortina/tecidos')
      .then((r) => setTecidos(r.tecidos))
      .catch(() => setTecidos([]))
      .finally(() => setCarregando(false));
  }, []);

  // Ao trocar o modelo, ajusta a fixação para uma permitida.
  useEffect(() => {
    const permitidas = FIXACOES_POR_MODELO[modelo];
    if (!permitidas.includes(fixacao)) setFixacao(permitidas[0]);
    onResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo]);

  const doisTecidos = config !== 'um_tecido';
  const varaoDuplo = config === 'dois_tecidos_varao_duplo';
  const isWave = modelo === 'wave';
  const fixacoesDisponiveis = FIXACOES_CORTINA.filter((f) => FIXACOES_POR_MODELO[modelo].includes(f.value));

  const formValido =
    Number(largura) > 0 && Number(altura) > 0 && tecidoFrenteId !== '' && (!doisTecidos || tecidoTrasId !== '');

  async function calcular() {
    if (!formValido || calculando) return;
    setCalculando(true);
    setErro(null);
    onResult(null);
    try {
      const r = await api.post<CalcularCortinaResposta>('/calcular/cortina', {
        modelo,
        fixacao,
        config,
        largura: Number(largura),
        altura: Number(altura),
        tecido_frente_id: tecidoFrenteId,
        tecido_tras_id: doisTecidos ? tecidoTrasId : undefined,
        franzido_frente: isWave ? undefined : Number(franzidoFrente),
        franzido_tras: varaoDuplo ? Number(franzidoTras) : undefined,
        tamanho_barra: Number(tamanhoBarra),
        tipo_barra: tipoBarra,
        aberturas: Number(aberturas),
      });
      onResult(r);
    } catch (e) {
      onResult(null);
      setErro(e instanceof ApiError ? e.message : 'Não foi possível calcular. Tente novamente.');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="card p-4 max-w-form">
      <h4 className="text-lg-ui font-medium mb-4">Dados da Cortina</h4>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label">Modelo<span className="label-required">*</span></label>
            <select className="input" value={modelo} onChange={(e) => setModelo(e.target.value as ModeloCortina)}>
              {MODELOS_CORTINA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Fixação<span className="label-required">*</span></label>
            <select className="input" value={fixacao} onChange={(e) => setFixacao(e.target.value as FixacaoCortina)}>
              {fixacoesDisponiveis.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Tecidos<span className="label-required">*</span></label>
            <select className="input" value={config} onChange={(e) => { setConfig(e.target.value as ConfigTecidoCortina); onResult(null); }}>
              {CONFIGS_CORTINA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {/* Tecido(s) — busca no grupo de cortina */}
        <div>
          <label className="form-label">Tecido {doisTecidos ? '(frente)' : ''}<span className="label-required">*</span></label>
          {carregando ? <div className="skeleton" style={{ height: 38 }} /> : (
            <TecidoSearch tecidos={tecidos} value={tecidoFrenteId} onChange={setTecidoFrenteId} placeholder="Buscar tecido…" />
          )}
        </div>
        {doisTecidos && (
          <div>
            <label className="form-label">Tecido (forro / trás)<span className="label-required">*</span></label>
            {carregando ? <div className="skeleton" style={{ height: 38 }} /> : (
              <TecidoSearch tecidos={tecidos} value={tecidoTrasId} onChange={setTecidoTrasId} placeholder="Buscar tecido…" />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Largura (m)<span className="label-required">*</span></label>
            <input type="number" className="input" min={0} step={0.01} value={largura} onChange={(e) => setLargura(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Altura (m)<span className="label-required">*</span></label>
            <input type="number" className="input" min={0} step={0.01} value={altura} onChange={(e) => setAltura(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {!isWave && (
            <div>
              <label className="form-label">Franzido frente</label>
              <input type="number" className="input" min={1} step={0.1} value={franzidoFrente} onChange={(e) => setFranzidoFrente(e.target.value)} />
            </div>
          )}
          {isWave && (
            <div className="col-span-1 text-xs-ui text-neutral-500 self-end pb-2">Franzido do Wave é fixo (fator 2,7).</div>
          )}
          {varaoDuplo && (
            <div>
              <label className="form-label">Franzido trás</label>
              <input type="number" className="input" min={1} step={0.1} value={franzidoTras} onChange={(e) => setFranzidoTras(e.target.value)} />
            </div>
          )}
          <div>
            <label className="form-label">Aberturas</label>
            <input type="number" className="input" min={0} step={1} value={aberturas} onChange={(e) => setAberturas(e.target.value)} title="0–1: ferragem par · 2+: múltiplo de 4" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Tamanho da barra (m)</label>
            <input type="number" className="input" min={0} step={0.01} value={tamanhoBarra} onChange={(e) => setTamanhoBarra(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Tipo de barra</label>
            <select className="input" value={tipoBarra} onChange={(e) => setTipoBarra(e.target.value as 'simples' | 'dupla')}>
              <option value="simples">Simples</option>
              <option value="dupla">Dupla</option>
            </select>
          </div>
        </div>

        {erro && <div className="helper-error">{erro}</div>}

        <button type="button" className="btn btn-success w-full" disabled={!formValido || calculando} aria-disabled={!formValido || calculando} onClick={calcular}>
          {calculando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faCalculator} /> Calcular</>}
        </button>
      </div>
    </div>
  );
}
