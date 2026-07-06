// apps/web/src/pages/admin/AdminRegras.tsx
// Módulo Admin → Regras de Cálculo: parametriza o motor (persiana + cortina).
// Abre em modo VISUALIZAÇÃO (regras em vigor, só leitura); o botão Editar habilita
// a alteração. Ao salvar, reflete na hora em toda a aplicação.

import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFloppyDisk, faRotateLeft, faPen, faXmark, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { TIPOS_PERSIANA } from '../../lib/calcTypes';
import { MODELOS_CORTINA_CALC } from '../../lib/cortinaTypes';
import type { RegrasCalculo, RegrasResp, ComposicaoCalculo, ComposicaoTipo } from '../../lib/regrasTypes';

const clone = (r: RegrasCalculo) => JSON.parse(JSON.stringify(r)) as RegrasCalculo;

export function AdminRegras() {
  const { showToast } = useToast();
  const [regras, setRegras] = useState<RegrasCalculo | null>(null);
  const [original, setOriginal] = useState<RegrasCalculo | null>(null); // regras em vigor (para cancelar edição)
  const [padrao, setPadrao] = useState<RegrasCalculo | null>(null);
  const [composicao, setComposicao] = useState<ComposicaoCalculo | null>(null);
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
      setComposicao(r.composicao);
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
        <div className="alert alert-info mb-4 text-sm-ui">
          <span>
            O preço da persiana passou a ser a <strong>soma de todos os componentes + tecido</strong>,
            com os valores puxados do GestãoClick pelo código de cada componente (receitas das planilhas do Victor).
            Apenas o <strong>TC (fator da altura)</strong> abaixo ainda afeta o cálculo. Os demais campos desta seção
            e da seção "Por tipo" (margem, fator de venda, base de venda, dobrar altura, descontos e passos) são
            <strong> legado</strong> e <strong>não influenciam mais o preço</strong> — as quantidades agora estão nas receitas.
          </span>
        </div>
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
                  <td style={{ padding: 8 }}><ComposicaoCell label={t.label} comp={composicao?.persiana[t.value]} /></td>
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
            {MODELOS_CORTINA_CALC.map((m) => (
              <tr key={m.value} style={{ borderTop: '1px solid #dee2e6' }}>
                <td style={{ padding: 8 }}><ComposicaoCell label={m.label} comp={composicao?.cortina[m.value]} /></td>
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

/**
 * Nome do tipo/modelo com um ícone "i": ao passar o mouse, mostra QUAIS produtos do
 * GestãoClick entram no cálculo. Separa "afeta o preço" de "lista técnica (não afeta)".
 */
function ComposicaoCell({ label, comp }: { label: string; comp?: ComposicaoTipo }) {
  const [aberto, setAberto] = useState(false);
  const [paraCima, setParaCima] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Abre pra cima quando não há espaço suficiente abaixo (ex.: últimas linhas da tabela),
  // evitando que o popover estenda a página e desloque a barra de rolagem.
  const POPUP_MAX = 380;
  function abrir() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const abaixo = window.innerHeight - rect.bottom;
      setParaCima(abaixo < POPUP_MAX && rect.top > abaixo);
    }
    setAberto(true);
  }

  return (
    <div
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      onMouseEnter={abrir}
      onMouseLeave={() => setAberto(false)}
    >
      <span className="text-sm-ui text-neutral-700">{label}</span>
      {comp && <FontAwesomeIcon icon={faCircleInfo} className="text-neutral-400" style={{ cursor: 'help', fontSize: 13 }} />}
      {aberto && comp && (
        <div
          className="card"
          style={{ position: 'absolute', zIndex: 50, left: 0, width: 340, maxHeight: POPUP_MAX, overflowY: 'auto', padding: 12, boxShadow: '0 6px 20px rgba(0,0,0,.18)', cursor: 'default', ...(paraCima ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }) }}
        >
          <div className="text-xs-ui font-bold text-neutral-600 mb-2">Produtos do GestãoClick neste cálculo</div>

          <GrupoComp
            cor="var(--color-success)"
            titulo="Afeta o preço do cálculo"
            itens={comp.afeta_preco}
            vazio="Nenhum."
          />

          {comp.lista_tecnica.length > 0 && (
            <div className="mt-3">
              <GrupoComp
                cor="#adb5bd"
                titulo="Lista técnica (não afeta o preço)"
                itens={comp.lista_tecnica}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GrupoComp({ cor, titulo, itens, vazio }: { cor: string; titulo: string; itens: ComposicaoTipo['afeta_preco']; vazio?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, display: 'inline-block' }} />
        <span className="text-xs-ui font-semibold text-neutral-700">{titulo}</span>
      </div>
      {itens.length === 0 ? (
        <div className="text-xs-ui text-neutral-400 pl-4">{vazio}</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {itens.map((it, i) => (
            <li key={i} className="text-xs-ui text-neutral-700" style={{ padding: '3px 0 3px 16px', borderTop: i > 0 ? '1px solid #f1f3f5' : undefined }}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{it.rotulo}</span>
                {it.codigo_gc && <span className="font-mono" style={{ fontSize: 10, color: '#6c757d', background: '#f1f3f5', borderRadius: 3, padding: '0 4px' }}>#{it.codigo_gc}</span>}
              </div>
              {it.grupo_gc && <div className="text-neutral-500" style={{ fontSize: 10 }}>Grupo GC: {it.grupo_gc}</div>}
              {it.obs && <div className="text-neutral-400" style={{ fontSize: 10 }}>{it.obs}</div>}
            </li>
          ))}
        </ul>
      )}
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
