import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBan, faCircleCheck, faCopy, faCubes, faFloppyDisk, faPen, faPlus, faRotateLeft, faSliders as faSlidersIcon, faSpinner, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import type { CalculadoraTrilhoEspecial, ComponenteCalculadoraTrilho } from '../../lib/calcTypes';

const componenteVazio = (): ComponenteCalculadoraTrilho => ({ codigo_interno: '', descricao: '', qtd: 'LARGURA' });

export function CalculadorasTrilhoEspecial() {
  const { showToast } = useToast();
  const [calculadoras, setCalculadoras] = useState<CalculadoraTrilhoEspecial[]>([]);
  const [editando, setEditando] = useState<CalculadoraTrilhoEspecial | null>(null);
  const [criando, setCriando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

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

  async function salvar(lista: CalculadoraTrilhoEspecial[]) {
    setSalvando(true);
    try {
      const r = await api.put<{ calculadoras: CalculadoraTrilhoEspecial[] }>('/admin/calculadoras-trilho-especial', { calculadoras: lista });
      setCalculadoras(r.calculadoras);
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
    setEditando({ id: '', nome: '', db_tipo_produto: 'trilho_especial', ativo: true, componentes: [componenteVazio()] });
    setCriando(true);
  }

  function iniciarEdicao(calc: CalculadoraTrilhoEspecial) {
    setEditando(JSON.parse(JSON.stringify(calc)));
    setCriando(false);
  }

  function duplicar(calc: CalculadoraTrilhoEspecial) {
    setEditando({ ...JSON.parse(JSON.stringify(calc)), id: `${calc.id}_copia`, nome: `${calc.nome} (Cópia)`, ativo: true });
    setCriando(true);
  }

  function aplicar() {
    if (!editando) return;
    if (!editando.id.trim() || !editando.nome.trim()) {
      showToast('warning', 'Dados obrigatórios', 'Informe o identificador e o nome da calculadora.');
      return;
    }
    if (editando.componentes.length === 0) {
      showToast('warning', 'Produtos necessários', 'Adicione ao menos um produto à composição.');
      return;
    }
    if (editando.componentes.some((c) => !c.codigo_interno.trim() || !c.descricao.trim() || !c.qtd.trim())) {
      showToast('warning', 'Composição incompleta', 'Preencha código, descrição e fórmula de todos os produtos.');
      return;
    }
    if (criando && calculadoras.some((c) => c.id === editando.id)) {
      showToast('error', 'ID duplicado', 'Já existe uma calculadora com este identificador.');
      return;
    }
    const lista = criando
      ? [...calculadoras, editando]
      : calculadoras.map((c) => c.id === editando.id ? editando : c);
    void salvar(lista);
  }

  function atualizarComponente(index: number, patch: Partial<ComponenteCalculadoraTrilho>) {
    if (!editando) return;
    setEditando({ ...editando, componentes: editando.componentes.map((c, i) => i === index ? { ...c, ...patch } : c) });
  }

  async function restaurar() {
    setSalvando(true);
    try {
      const r = await api.put<{ calculadoras: CalculadoraTrilhoEspecial[] }>('/admin/calculadoras-trilho-especial', { calculadoras: null });
      setCalculadoras(r.calculadoras);
      showToast('success', 'Padrões restaurados', 'As calculadoras de trilhos especiais foram limpas.');
    } catch (e) {
      showToast('error', 'Falha ao restaurar padrões', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando calculadoras…</div>;

  if (editando) {
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
              A largura informada no orçamento será usada pelas fórmulas dos produtos. Exemplo: <span className="font-mono">LARGURA</span> ou <span className="font-mono">LARGURA*2</span>.
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-md-ui font-semibold text-neutral-700"><FontAwesomeIcon icon={faCubes} /> Produtos da composição</h4>
              <button type="button" className="btn btn-default btn-xs" onClick={() => setEditando({ ...editando, componentes: [...editando.componentes, componenteVazio()] })}><FontAwesomeIcon icon={faPlus} /> Adicionar produto</button>
            </div>
            <div className="text-xs-ui text-neutral-500">Cada linha representa um produto do Gestão Click e a fórmula de quantidade calculada pela largura.</div>
            <div className="space-y-3">
              {editando.componentes.map((componente, index) => (
                <div key={index} className="border border-neutral-300 rounded-sm bg-neutral-50 p-3">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-3">
                      <label className="form-label">Código interno GC<span className="label-required">*</span></label>
                      <input className="input font-mono" value={componente.codigo_interno} placeholder="ex: TRILHO-001" onChange={(e) => atualizarComponente(index, { codigo_interno: e.target.value })} />
                    </div>
                    <div className="md:col-span-5">
                      <label className="form-label">Produto / descrição<span className="label-required">*</span></label>
                      <input className="input" value={componente.descricao} placeholder="ex: Trilho superior" onChange={(e) => atualizarComponente(index, { descricao: e.target.value })} />
                    </div>
                    <div className="md:col-span-3">
                      <label className="form-label">Fórmula da quantidade<span className="label-required">*</span></label>
                      <input className="input font-mono" value={componente.qtd} placeholder="LARGURA" onChange={(e) => atualizarComponente(index, { qtd: e.target.value })} />
                    </div>
                    <button type="button" className="text-error hover:opacity-80 md:col-span-1 pb-2" title="Remover produto" onClick={() => setEditando({ ...editando, componentes: editando.componentes.filter((_, i) => i !== index) })}><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                </div>
              ))}
            </div>
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
          return <div key={calc.id} className="card p-4 flex flex-col justify-between" style={{ opacity: ativa ? 1 : 0.62 }}>
            <div><div className="flex justify-between items-start mb-2"><div className="font-bold text-md-ui text-neutral-800">{calc.nome}{!ativa && <span className="badge badge-secondary ml-2">Inativa</span>}</div><span className="text-2xs-ui bg-neutral-200 px-2 py-0.5 rounded-sm font-mono text-neutral-600">ID: {calc.id}</span></div><p className="text-xs-ui text-neutral-500 mb-4">{calc.componentes.length} produto(s) · cálculo por largura</p></div>
            <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3"><button className="btn btn-default btn-xs flex-1" onClick={() => iniciarEdicao(calc)}><FontAwesomeIcon icon={faPen} /> Editar</button><button className="btn btn-default btn-xs text-primary flex-1" onClick={() => duplicar(calc)}><FontAwesomeIcon icon={faCopy} /> Duplicar</button><button className={`btn btn-default btn-xs flex-1 ${ativa ? 'text-warning' : 'text-success'}`} onClick={() => void salvar(calculadoras.map((c) => c.id === calc.id ? { ...c, ativo: !ativa } : c))}><FontAwesomeIcon icon={ativa ? faBan : faCircleCheck} /> {ativa ? 'Inativar' : 'Reativar'}</button><button className="btn btn-default btn-xs text-error flex-1" onClick={() => { if (window.confirm('Deseja realmente excluir esta calculadora?')) void salvar(calculadoras.filter((c) => c.id !== calc.id)); }}><FontAwesomeIcon icon={faTrash} /> Excluir</button></div>
          </div>;
        })}
        {calculadoras.length === 0 && <div className="col-span-full card p-6 text-center text-neutral-500">Nenhuma calculadora de trilho especial cadastrada. Crie a primeira composição.</div>}
      </div>
    </div>
  );
}
