import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBan, faCircleCheck, faCopy, faCubes, faFloppyDisk, faPen, faPlus, faRotateLeft, faSliders as faSlidersIcon, faSpinner, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import type { CalculadoraTrilhoEspecial, ComponenteCalculadoraTrilho, VarianteCalculadoraTrilho } from '../../lib/calcTypes';
import { invalidarCacheado } from '../../lib/dadosCache';

const componenteVazio = (): ComponenteCalculadoraTrilho => ({ id: crypto.randomUUID(), codigo_interno: '', descricao: '', qtd: 'LARGURA' });
const varianteVazia = (id: string = crypto.randomUUID(), nome = 'Nova variante'): VarianteCalculadoraTrilho => ({ id, nome, motorizado: false, componentes: [componenteVazio()] });

export function CalculadorasTrilhoEspecial() {
  const { showToast } = useToast();
  const [calculadoras, setCalculadoras] = useState<CalculadoraTrilhoEspecial[]>([]);
  const [editando, setEditando] = useState<CalculadoraTrilhoEspecial | null>(null);
  const [criando, setCriando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [varianteAtiva, setVarianteAtiva] = useState('padrao');

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.get<{ calculadoras: CalculadoraTrilhoEspecial[] }>('/admin/calculadoras-trilho-especial');
      setCalculadoras(r.calculadoras);
    } catch (e) {
      showToast('error', 'Falha ao carregar calculadoras de trilhos', e instanceof ApiError ? e.message : '');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  // Recebe uma função em vez de uma lista pronta: busca o estado mais recente do
  // servidor logo antes de aplicar a mudança, para não sobrescrever com dados
  // desatualizados de uma aba esquecida em segundo plano (duas abas abertas, uma
  // com a lista antiga em memória, causavam perda silenciosa de edições).
  async function salvar(calcularLista: (atual: CalculadoraTrilhoEspecial[]) => CalculadoraTrilhoEspecial[]) {
    setSalvando(true);
    try {
      const atual = await api.get<{ calculadoras: CalculadoraTrilhoEspecial[] }>('/admin/calculadoras-trilho-especial');
      const lista = calcularLista(atual.calculadoras);
      const r = await api.put<{ calculadoras: CalculadoraTrilhoEspecial[] }>('/admin/calculadoras-trilho-especial', { calculadoras: lista });
      setCalculadoras(r.calculadoras);
      invalidarCacheado('calculadoras-trilho-especial-v1');
      setEditando(null);
      setCriando(false);
      showToast('success', 'Calculadoras de trilhos salvas', 'As novas composições já estão disponíveis para uso.');
    } catch (e) {
      showToast('error', 'Falha ao salvar calculadoras de trilhos', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarNova() {
    setEditando({ id: '', nome: '', db_tipo_produto: 'trilho_especial', ativo: true, componentes: [], variantes: [varianteVazia('padrao', 'Padrão')] });
    setVarianteAtiva('padrao');
    setCriando(true);
  }

  function iniciarEdicao(calc: CalculadoraTrilhoEspecial) {
    setEditando(JSON.parse(JSON.stringify(calc)));
    setVarianteAtiva(calc.variantes?.[0]?.id ?? 'padrao');
    setCriando(false);
  }

  function duplicar(calc: CalculadoraTrilhoEspecial) {
    const copia = JSON.parse(JSON.stringify(calc)) as CalculadoraTrilhoEspecial;
    setEditando({ ...copia, id: `${calc.id}_copia`, nome: `${calc.nome} (Cópia)`, ativo: true });
    setVarianteAtiva(copia.variantes?.[0]?.id ?? 'padrao');
    setCriando(true);
  }

  function aplicar() {
    if (!editando) return;
    if (!editando.id.trim() || !editando.nome.trim()) {
      showToast('warning', 'Dados obrigatórios', 'Informe o identificador e o nome da calculadora.');
      return;
    }
    const variantes = editando.variantes ?? [];
    if (variantes.length === 0) {
      showToast('warning', 'Variantes necessárias', 'Adicione ao menos uma variante ao modelo.');
      return;
    }
    if (variantes.some((v) => !v.nome.trim() || v.componentes.length === 0 || v.componentes.some((c) => (!c.grupo_id?.trim() && !c.codigo_interno.trim()) || !c.descricao.trim() || !c.qtd.trim()))) {
      showToast('warning', 'Composição incompleta', 'Preencha código (ou grupo), descrição e fórmula de todos os produtos.');
      return;
    }
    if (criando && calculadoras.some((c) => c.id === editando.id)) {
      showToast('error', 'ID duplicado', 'Já existe uma calculadora com este identificador.');
      return;
    }
    const editandoComComponentes = { ...editando, componentes: variantes[0].componentes };
    void salvar((atual) => criando
      ? [...atual, editandoComComponentes]
      : atual.map((c) => c.id === editando.id ? editandoComComponentes : c));
  }

  function atualizarVariante(id: string, patch: Partial<VarianteCalculadoraTrilho>) {
    if (!editando) return;
    setEditando({ ...editando, variantes: (editando.variantes ?? []).map((v) => v.id === id ? { ...v, ...patch } : v) });
  }

  function atualizarComponente(index: number, patch: Partial<ComponenteCalculadoraTrilho>) {
    if (!editando) return;
    const variante = (editando.variantes ?? []).find((v) => v.id === varianteAtiva);
    if (!variante) return;
    atualizarVariante(variante.id, { componentes: variante.componentes.map((c, i) => i === index ? { ...c, ...patch } : c) });
  }

  function adicionarVariante() {
    if (!editando) return;
    const variantes = editando.variantes ?? [];
    const nova = varianteVazia(crypto.randomUUID(), `Variante ${variantes.length + 1}`);
    setEditando({ ...editando, variantes: [...variantes, nova] });
    setVarianteAtiva(nova.id);
  }

  function duplicarVariante(origem: VarianteCalculadoraTrilho) {
    if (!editando) return;
    const variantes = editando.variantes ?? [];
    const nova: VarianteCalculadoraTrilho = { ...JSON.parse(JSON.stringify(origem)), id: crypto.randomUUID(), nome: `${origem.nome} (cópia)` };
    setEditando({ ...editando, variantes: [...variantes, nova] });
    setVarianteAtiva(nova.id);
  }

  async function restaurar() {
    setSalvando(true);
    try {
      const r = await api.put<{ calculadoras: CalculadoraTrilhoEspecial[] }>('/admin/calculadoras-trilho-especial', { calculadoras: null });
      setCalculadoras(r.calculadoras);
      invalidarCacheado('calculadoras-trilho-especial-v1');
      showToast('success', 'Padrões restaurados', 'As calculadoras de trilhos especiais foram limpas.');
    } catch (e) {
      showToast('error', 'Falha ao restaurar padrões', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando calculadoras…</div>;

  if (editando) {
    const variantes = editando.variantes ?? [];
    const variante = variantes.find((v) => v.id === varianteAtiva) ?? variantes[0];
    return (
      <div className="card p-6">
        <div className="flex justify-between items-center mb-6 pb-2 border-b border-neutral-200">
          <h3 className="text-lg-ui font-bold text-neutral-800">{criando ? 'Criar Calculadora de Trilho Especial' : `Editar Calculadora: ${editando.nome}`}</h3>
          <button className="btn btn-default btn-sm" onClick={() => setEditando(null)}><FontAwesomeIcon icon={faXmark} /> Voltar à lista</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:border-r border-neutral-200 lg:pr-6">
            <h4 className="text-md-ui font-semibold text-neutral-700"><FontAwesomeIcon icon={faSlidersIcon} /> Metadados Gerais</h4>
            <div>
              <label className="form-label">Identificador Único (ID)<span className="label-required">*</span></label>
              <input className="input font-mono" disabled={!criando} value={editando.id} placeholder="ex: trilho_wave" onChange={(e) => setEditando({ ...editando, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
              {criando && <div className="helper-text">Use apenas minúsculas, números e sublinhado.</div>}
            </div>
            <div>
              <label className="form-label">Nome de Exibição<span className="label-required">*</span></label>
              <input className="input" value={editando.nome} placeholder="ex: Trilho Wave" onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
            </div>
            <div className="alert alert-info text-xs-ui">
              As fórmulas podem usar <span className="font-mono">LARGURA</span>, <span className="font-mono">EMENDAS</span> e <span className="font-mono">TC</span>. Para o produto da emenda, use apenas <span className="font-mono">EMENDAS</span>. Os campos "Emendas/trilho" e "TC" só aparecem no orçamento do vendedor quando alguma fórmula da variante os utiliza.
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-md-ui font-semibold text-neutral-700"><FontAwesomeIcon icon={faCubes} /> Fórmulas e componentes por variante</h4>
              <div className="flex gap-2">
                {variante && (
                  <button type="button" className="btn btn-default btn-sm" title="Duplica a variante selecionada, incluindo todos os produtos e fórmulas" onClick={() => duplicarVariante(variante)}>
                    <FontAwesomeIcon icon={faCopy} /> Duplicar variante
                  </button>
                )}
                <button type="button" className="btn btn-success btn-sm" onClick={adicionarVariante}>
                  <FontAwesomeIcon icon={faPlus} /> Adicionar variante
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-neutral-300 pb-2">
              {variantes.map((v) => <button key={v.id} type="button" className={`btn btn-xs ${v.id === variante?.id ? 'btn-primary' : 'btn-default'}`} onClick={() => setVarianteAtiva(v.id)}><span className="w-2 h-2 rounded-full mr-1 inline-block bg-success" />{v.nome || 'Sem nome'}</button>)}
            </div>
            {variante && <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 bg-neutral-50 border border-neutral-300 rounded-sm p-3">
                <div className="lg:col-span-2"><label className="form-label">Nome da variante<span className="label-required">*</span></label><input className="input" value={variante.nome} placeholder="ex: Motorizado central" onChange={(e) => atualizarVariante(variante.id, { nome: e.target.value })} /></div>
                <label className="flex items-center gap-2 lg:mt-6 cursor-pointer text-sm-ui text-neutral-700"><input type="checkbox" checked={variante.motorizado === true} onChange={(e) => atualizarVariante(variante.id, { motorizado: e.target.checked })} /><span>Trilho motorizado</span></label>
              </div>
              <div className="flex justify-between items-center"><div className="text-xs-ui text-neutral-500">Cada linha representa um produto do Gestão Click. Variantes motorizadas são exportadas somente com o nome.</div><button type="button" className="btn btn-default btn-xs" onClick={() => atualizarVariante(variante.id, { componentes: [...variante.componentes, componenteVazio()] })}><FontAwesomeIcon icon={faPlus} /> Adicionar produto</button></div>
            <div className="space-y-3">
              {variante.componentes.map((componente, index) => {
                const modoGrupo = componente.grupo_id !== undefined;
                return (
                <div key={componente.id} className="border border-neutral-300 rounded-sm bg-neutral-50 p-3">
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-end">
                    <div className="xl:col-span-2">
                      <label className="form-label">Modo</label>
                      <select
                        className="input"
                        value={modoGrupo ? 'grupo' : 'fixo'}
                        onChange={(e) => atualizarComponente(index, e.target.value === 'grupo' ? { grupo_id: '', codigo_interno: '' } : { grupo_id: undefined })}
                      >
                        <option value="fixo">Produto fixo</option>
                        <option value="grupo">Grupo (vendedor escolhe)</option>
                      </select>
                    </div>
                    <div className="xl:col-span-2">
                      {modoGrupo ? (
                        <>
                          <label className="form-label">Grupo GestãoClick (ID)<span className="label-required">*</span></label>
                          <input className="input font-mono" value={componente.grupo_id ?? ''} placeholder="ex: 5923373" onChange={(e) => atualizarComponente(index, { grupo_id: e.target.value })} />
                        </>
                      ) : (
                        <>
                          <label className="form-label">Código interno GC<span className="label-required">*</span></label>
                          <input className="input font-mono" value={componente.codigo_interno} placeholder="ex: TRILHO-001" onChange={(e) => atualizarComponente(index, { codigo_interno: e.target.value })} />
                        </>
                      )}
                    </div>
                    <div className="xl:col-span-4">
                      <label className="form-label">Produto / descrição<span className="label-required">*</span></label>
                      <input className="input" value={componente.descricao} placeholder="ex: Trilho superior" onChange={(e) => atualizarComponente(index, { descricao: e.target.value })} />
                    </div>
                    <div className="xl:col-span-3">
                      <label className="form-label">Fórmula da quantidade<span className="label-required">*</span></label>
                      <input className="input font-mono" value={componente.qtd} placeholder="LARGURA" onChange={(e) => atualizarComponente(index, { qtd: e.target.value })} />
                    </div>
                    <button type="button" className="text-error hover:opacity-80 xl:col-span-1 pb-2" title="Remover produto" onClick={() => atualizarVariante(variante.id, { componentes: variante.componentes.filter((_, i) => i !== index) })}><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                  {modoGrupo && <div className="helper-text mt-2">No orçamento, o vendedor escolherá o produto entre os itens ativos deste grupo (ex.: cores diferentes).</div>}
                </div>
                );
              })}
            </div>
            {variantes.length > 1 && <button type="button" className="text-error hover:opacity-80 text-xs-ui self-start" onClick={() => { const restantes = variantes.filter((v) => v.id !== variante.id); setEditando({ ...editando, variantes: restantes }); setVarianteAtiva(restantes[0]?.id ?? ''); }}><FontAwesomeIcon icon={faTrash} /> Remover esta variante</button>}
            </>}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-200">
          <button className="btn btn-default" disabled={salvando} onClick={() => setEditando(null)}>Cancelar</button>
          <button className="btn btn-success" disabled={salvando} onClick={aplicar}>{salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar Calculadora</>}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div><h2 className="text-lg-ui font-semibold text-neutral-800">Calculadoras de trilhos especiais</h2><p className="text-sm-ui text-neutral-500">Componha vários produtos e calcule suas quantidades pela largura.</p></div>
        <div className="flex gap-2"><button className="btn btn-default" disabled={salvando} onClick={() => void restaurar()}><FontAwesomeIcon icon={faRotateLeft} /> Restaurar</button><button className="btn btn-primary" onClick={iniciarNova}><FontAwesomeIcon icon={faPlus} /> Nova calculadora</button></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {calculadoras.map((calc) => {
          const ativa = calc.ativo !== false;
          return <div key={calc.id} className="card card-hover p-4 flex flex-col justify-between" style={{ opacity: ativa ? 1 : 0.62 }}>
            <div><div className="flex justify-between items-start mb-2"><div className="font-bold text-md-ui text-neutral-800">{calc.nome}{!ativa && <span className="badge badge-secondary ml-2">Inativa</span>}</div><span className="text-2xs-ui bg-neutral-200 px-2 py-0.5 rounded-sm font-mono text-neutral-600">ID: {calc.id}</span></div><p className="text-xs-ui text-neutral-500 mb-4">{calc.variantes?.length ?? 1} variante(s) · cálculo por largura</p></div>
            <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3"><button className="btn btn-default btn-xs flex-1" onClick={() => iniciarEdicao(calc)}><FontAwesomeIcon icon={faPen} /> Editar</button><button className="btn btn-default btn-xs text-primary flex-1" onClick={() => duplicar(calc)}><FontAwesomeIcon icon={faCopy} /> Duplicar</button><button className={`btn btn-default btn-xs flex-1 ${ativa ? 'text-warning' : 'text-success'}`} onClick={() => void salvar((atual) => atual.map((c) => c.id === calc.id ? { ...c, ativo: c.ativo === false } : c))}><FontAwesomeIcon icon={ativa ? faBan : faCircleCheck} /> {ativa ? 'Inativar' : 'Reativar'}</button><button className="btn btn-default btn-xs text-error flex-1" onClick={() => { if (window.confirm('Deseja realmente excluir esta calculadora?')) void salvar((atual) => atual.filter((c) => c.id !== calc.id)); }}><FontAwesomeIcon icon={faTrash} /> Excluir</button></div>
          </div>;
        })}
        {calculadoras.length === 0 && <div className="col-span-full card p-6 text-center text-neutral-500">Nenhuma calculadora de trilho especial cadastrada. Crie a primeira composição.</div>}
      </div>
    </div>
  );
}
