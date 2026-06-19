// apps/web/src/pages/admin/AdminRegras.tsx
// Módulo Admin → Regras de Cálculo: parametriza o motor (persiana + cortina).
// Abre em modo VISUALIZAÇÃO (regras em vigor, só leitura); o botão Editar habilita
// a alteração. Ao salvar, reflete na hora em toda a aplicação.

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFloppyDisk, faRotateLeft, faPen, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { TIPOS_PERSIANA } from '../../lib/calcTypes';
import { MODELOS_CORTINA } from '../../lib/cortinaTypes';
import type { RegrasCalculo, RegrasResp } from '../../lib/regrasTypes';

const clone = (r: RegrasCalculo) => JSON.parse(JSON.stringify(r)) as RegrasCalculo;

export function AdminRegras() {
  const { showToast } = useToast();
  const [regras, setRegras] = useState<RegrasCalculo | null>(null);
  const [original, setOriginal] = useState<RegrasCalculo | null>(null); // regras em vigor (para cancelar edição)
  const [padrao, setPadrao] = useState<RegrasCalculo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [restaurarAberto, setRestaurarAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<RegrasResp>('/admin/regras-calculo');
      setRegras(r.regras);
      setOriginal(r.regras);
      setPadrao(r.padrao);
    } catch (e) {
      showToast('error', 'Falha ao carregar regras', e instanceof ApiError ? e.message : '');
    } finally {
      setCarregando(false);
    }
  }, [showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  // Atualiza o estado aninhado de forma imutável (clone + mutação local).
  const up = useCallback((mut: (r: RegrasCalculo) => void) => {
    setRegras((prev) => {
      if (!prev) return prev;
      const n = clone(prev);
      mut(n);
      return n;
    });
  }, []);

  async function salvar() {
    if (!regras) return;
    setSalvando(true);
    try {
      const r = await api.put<RegrasResp>('/admin/regras-calculo', { regras });
      setRegras(r.regras);
      setOriginal(r.regras);
      setEditando(false);
      showToast('success', 'Regras de cálculo salvas', 'As novas regras já valem para toda a aplicação.');
    } catch (e) {
      showToast('error', 'Falha ao salvar', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  function cancelarEdicao() {
    if (original) setRegras(clone(original)); // descarta alterações, volta às regras em vigor
    setEditando(false);
  }

  function restaurar() {
    setRestaurarAberto(false);
    if (padrao) setRegras(clone(padrao));
    showToast('info', 'Valores padrão preenchidos', 'Revise e clique em Salvar para aplicar.');
  }

  if (carregando || !regras) {
    return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando regras…</div>;
  }

  const p = regras.persiana;
  const c = regras.cortina;
  const ro = !editando; // somente leitura quando não está editando

  const botoes = editando ? (
    <>
      <button key="cancelar" className="btn btn-default" disabled={salvando} onClick={cancelarEdicao}>
        <FontAwesomeIcon icon={faXmark} /> Cancelar edição
      </button>
      <button key="restaurar" className="btn btn-default" disabled={salvando} onClick={() => setRestaurarAberto(true)}>
        <FontAwesomeIcon icon={faRotateLeft} /> Restaurar padrão
      </button>
      <button key="salvar" className="btn btn-success" disabled={salvando} onClick={salvar}>
        {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar</>}
      </button>
    </>
  ) : (
    <button key="editar" className="btn btn-warning" onClick={() => setEditando(true)}>
      <FontAwesomeIcon icon={faPen} /> Editar
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl-ui font-bold text-neutral-800">Regras de Cálculo</h1>
        <div className="flex gap-2">{botoes}</div>
      </div>

      <div className={`alert ${editando ? 'alert-warning' : 'alert-info'} mb-4 text-sm-ui`}>
        {editando
          ? <span>Modo de <strong>edição</strong>. As alterações valem para <strong>toda a aplicação</strong> assim que você salvar — revise com cuidado.</span>
          : <span>Estas são as regras <strong>em vigor</strong> na aplicação. Clique em <strong>Editar</strong> para alterar.</span>}
      </div>

      {/* ---------- PERSIANA ---------- */}
      <Secao titulo="Persiana — Geral">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Num label="TC (fator da altura)" hint="TC = altura × fator (ex.: 0,75)" value={p.tc_fator} step={0.01} ro={ro} onChange={(v) => up((r) => { r.persiana.tc_fator = v; })} />
          <Num label="Desconto fita dupla (rolo)" hint="Largura − X (m)" value={p.fita_dupla_desconto_rolo} step={0.005} ro={ro} onChange={(v) => up((r) => { r.persiana.fita_dupla_desconto_rolo = v; })} />
          <Num label="Desconto fita colante (rolo)" hint="Largura − X (m)" value={p.fita_colante_desconto_rolo} step={0.005} ro={ro} onChange={(v) => up((r) => { r.persiana.fita_colante_desconto_rolo = v; })} />
          <Num label="Desconto base cônica (rolo)" hint="Largura − X (m)" value={p.base_desconto_rolo} step={0.005} ro={ro} onChange={(v) => up((r) => { r.persiana.base_desconto_rolo = v; })} />
          <Num label="Passo do parafuso (m)" hint="1 parafuso a cada X m" value={p.parafuso_passo} step={0.05} ro={ro} onChange={(v) => up((r) => { r.persiana.parafuso_passo = v; })} />
          <Num label="Tampas por persiana" value={p.tampas_por_persiana} step={1} ro={ro} onChange={(v) => up((r) => { r.persiana.tampas_por_persiana = v; })} />
        </div>
      </Secao>

      <Secao titulo="Persiana — Por tipo">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} /></colgroup>
          <thead><tr style={{ borderBottom: '2px solid #dee2e6' }}>
            {['Tipo', 'Margem (m)', 'Fator de venda', 'Base de venda', 'Dobrar altura'].map((h) => <Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {TIPOS_PERSIANA.map((t) => {
              const rt = p.tipos[t.value];
              if (!rt) return null;
              return (
                <tr key={t.value} style={{ borderTop: '1px solid #dee2e6' }}>
                  <td style={{ padding: 8 }} className="text-sm-ui text-neutral-700">{t.label}</td>
                  <td style={{ padding: 8 }}><InNum value={rt.margem} step={0.01} ro={ro} onChange={(v) => up((r) => { r.persiana.tipos[t.value].margem = v; })} /></td>
                  <td style={{ padding: 8 }}><InNum value={rt.fator_venda} step={0.1} ro={ro} onChange={(v) => up((r) => { r.persiana.tipos[t.value].fator_venda = v; })} /></td>
                  <td style={{ padding: 8 }}>
                    <select className="input" style={{ height: 32, fontSize: 13 }} disabled={ro} value={rt.base_venda} onChange={(e) => up((r) => { r.persiana.tipos[t.value].base_venda = e.target.value as 'dimensao' | 'largura'; })}>
                      <option value="dimensao">Dimensão (rolo)</option>
                      <option value="largura">Largura</option>
                    </select>
                  </td>
                  <td style={{ padding: 8, textAlign: 'center' }}>
                    <input type="checkbox" disabled={ro} checked={rt.dobrar_altura} onChange={(e) => up((r) => { r.persiana.tipos[t.value].dobrar_altura = e.target.checked; })} style={{ accentColor: 'var(--action-add)', width: 18, height: 18 }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Secao>

      {/* ---------- CORTINA ---------- */}
      <Secao titulo="Cortina — Geral">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Num label="Fator do Wave" hint="Tecido = largura × fator" value={c.franzido_wave} step={0.1} ro={ro} onChange={(v) => up((r) => { r.cortina.franzido_wave = v; })} />
          <Num label="Passo de corte do tecido (m)" hint="Arredonda p/ múltiplo de X" value={c.passo_tecido} step={0.01} ro={ro} onChange={(v) => up((r) => { r.cortina.passo_tecido = v; })} />
          <Num label="Passo do botão do Wave (m)" hint="1 botão a cada X m" value={c.passo_botao_wave} step={0.01} ro={ro} onChange={(v) => up((r) => { r.cortina.passo_botao_wave = v; })} />
          <Num label="Franzido padrão — frente" value={c.franzido_frente_default} step={0.1} ro={ro} onChange={(v) => up((r) => { r.cortina.franzido_frente_default = v; })} />
          <Num label="Franzido padrão — forro/trás" value={c.franzido_tras_default} step={0.1} ro={ro} onChange={(v) => up((r) => { r.cortina.franzido_tras_default = v; })} />
          <Num label="Tamanho da barra padrão (cm)" value={c.tamanho_barra_default * 100} step={1} ro={ro} onChange={(v) => up((r) => { r.cortina.tamanho_barra_default = v / 100; })} />
          <div>
            <label className="form-label">Tipo de barra padrão</label>
            <select className="input" disabled={ro} value={c.tipo_barra_default} onChange={(e) => up((r) => { r.cortina.tipo_barra_default = e.target.value as 'simples' | 'dupla'; })}>
              <option value="simples">Simples</option>
              <option value="dupla">Dupla</option>
            </select>
          </div>
          <Num label="Espaçamento dos ilhós (m)" value={c.espacamento_ilhos_default} step={0.01} ro={ro} onChange={(v) => up((r) => { r.cortina.espacamento_ilhos_default = v; })} />
          <Num label="Espaçamento da ferragem (m)" hint="Argola/rodízio a cada X m" value={c.espacamento_ferragem_default} step={0.01} ro={ro} onChange={(v) => up((r) => { r.cortina.espacamento_ferragem_default = v; })} />
          <Num label="Aberturas padrão" value={c.aberturas_default} step={1} ro={ro} onChange={(v) => up((r) => { r.cortina.aberturas_default = v; })} />
        </div>
      </Secao>

      <Secao titulo="Cortina — Por modelo">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup><col /><col style={{ width: 180 }} /><col style={{ width: 140 }} /></colgroup>
          <thead><tr style={{ borderBottom: '2px solid #dee2e6' }}>
            {['Modelo', 'Folga de topo (m)', 'Tem entretela'].map((h) => <Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {MODELOS_CORTINA.map((m) => (
              <tr key={m.value} style={{ borderTop: '1px solid #dee2e6' }}>
                <td style={{ padding: 8 }} className="text-sm-ui text-neutral-700">{m.label}</td>
                <td style={{ padding: 8 }}><InNum value={c.folga_topo[m.value]} step={0.01} ro={ro} onChange={(v) => up((r) => { r.cortina.folga_topo[m.value] = v; })} /></td>
                <td style={{ padding: 8, textAlign: 'center' }}>
                  <input type="checkbox" disabled={ro} checked={c.tem_entretela[m.value]} onChange={(e) => up((r) => { r.cortina.tem_entretela[m.value] = e.target.checked; })} style={{ accentColor: 'var(--action-add)', width: 18, height: 18 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <div className="flex justify-end gap-2 mt-4">{botoes}</div>

      <ConfirmModal
        aberto={restaurarAberto}
        titulo="Restaurar valores padrão"
        mensagem="Isso preenche todos os campos com os valores originais do sistema. Você ainda precisará clicar em Salvar para aplicar."
        confirmarLabel="Restaurar"
        cancelarLabel="Voltar"
        onConfirmar={restaurar}
        onCancelar={() => setRestaurarAberto(false)}
      />
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 mb-4">
      <h2 className="text-lg-ui font-bold text-neutral-800 mb-3">{titulo}</h2>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: 8, textAlign: 'left', fontWeight: 700 }} className="text-xs-ui text-neutral-600">{children}</th>;
}

function Num({ label, hint, value, step, ro, onChange }: { label: string; hint?: string; value: number; step?: number; ro?: boolean; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <input type="number" className="input" step={step ?? 0.01} min={0} disabled={ro} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="helper-text">{hint}</div>}
    </div>
  );
}

function InNum({ value, step, ro, onChange }: { value: number; step?: number; ro?: boolean; onChange: (v: number) => void }) {
  return <input type="number" className="input" style={{ height: 32, fontSize: 13 }} step={step ?? 0.01} min={0} disabled={ro} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}
