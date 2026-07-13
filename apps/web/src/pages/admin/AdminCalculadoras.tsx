// apps/web/src/pages/admin/AdminCalculadoras.tsx
// Tela de gerenciamento dinâmico de calculadoras e fórmulas.
// Permite listar, editar, excluir e criar calculadoras de persiana e cortina.

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faPlus,
  faTrash,
  faFloppyDisk,
  faRotateLeft,
  faPen,
  faXmark,
  faCircleInfo,
  faSliders,
  faCubes,
  faScroll,
  faLayerGroup,
  faCopy,
  faBan,
  faCircleCheck,
  faMagnifyingGlass,
} from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { formatBRL, formatQtd } from '../../lib/formatacao';
import type { CalculadoraPersiana, ComponenteCalculadora, ReceitaCalculadora, CalculadoraCortina, CamadaCalculadoraCortina } from '../../lib/calcTypes';

// Mapeamentos de enums fixos no BD/API
const DB_TIPOS_PRODUTO = [
  { value: 'persiana_rolo_blackout', label: 'Rolo Blackout' },
  { value: 'persiana_rolo_screen', label: 'Rolo Screen' },
  { value: 'persiana_rolo_translucido', label: 'Rolo Translúcido' },
  { value: 'persiana_rolo_double_vision', label: 'Rolo Double Vision' },
  { value: 'persiana_romana_blackout', label: 'Romana Blackout' },
  { value: 'persiana_romana_screen', label: 'Romana Screen' },
  { value: 'persiana_romana_translucido', label: 'Romana Translúcido' },
];

const FAMILIAS = [
  { value: 'rolo_bk_translucido', label: 'Rolo (Blackout / Translúcido)' },
  { value: 'double_vision', label: 'Double Vision' },
  { value: 'tela_solar', label: 'Tela Solar' },
  { value: 'romana', label: 'Romana' },
  { value: 'romana_tela_solar', label: 'Romana Tela Solar' },
  { value: 'vertical', label: 'Vertical' },
];

const VARIANTES = [
  { key: 'com_bando', label: 'Com Bandô' },
  { key: 'sem_bando', label: 'Sem Bandô' },
  { key: 'motor_com_bando', label: 'Motorizado com Bandô' },
  { key: 'motor_sem_bando', label: 'Motorizado sem Bandô' },
] as const;

const MODELOS_CORTINA = [
  { value: 'wave', label: 'Wave' },
  { value: 'prega', label: 'Prega Americana' },
  { value: 'franzido', label: 'Franzido' },
  { value: 'ilhos', label: 'Ilhós' },
];

const FIXACOES_CORTINA = [
  { value: 'varao', label: 'Varão' },
  { value: 'trilho', label: 'Trilho (canaleta)' },
  { value: 'varao_suico', label: 'Varão Suíço' },
];

type VarianteKey = (typeof VARIANTES)[number]['key'];
interface GrupoProdutoGc { id: string; grupo_pai_id: string | null; nome: string }
interface ProdutoGcResumo { id: string; nome: string; codigo_interno: string; grupo_id: string; nome_grupo: string }
interface LinhaPreviewPersiana {
  codigo_interno: string;
  descricao: string;
  quantidade: number;
  preco: number;
  subtotal: number;
  descricao_original: string;
  descricao_alvo: string;
  codigo_original: string;
  origem: 'original' | 'cor' | 'fallback';
  alerta?: string;
}
interface PreviewPersiana {
  familia: string;
  variante: string;
  valor: number;
  variaveis: Record<string, number>;
  tecido: { quantidade: number; preco: number; subtotal: number };
  itens: LinhaPreviewPersiana[];
}

export function AdminCalculadoras() {
  const { showToast } = useToast();
  
  // Abas
  const [secaoAtiva, setSecaoAtiva] = useState<'persiana' | 'cortina'>('persiana');
  
  // Dados
  const [calculadorasPersiana, setCalculadorasPersiana] = useState<CalculadoraPersiana[]>([]);
  const [calculadorasCortina, setCalculadorasCortina] = useState<CalculadoraCortina[]>([]);
  const [gruposGc, setGruposGc] = useState<GrupoProdutoGc[]>([]);
  const [produtosGc, setProdutosGc] = useState<ProdutoGcResumo[]>([]);
  const [gcOffline, setGcOffline] = useState(false);
  const [grupoProdutosSelecionado, setGrupoProdutosSelecionado] = useState('');
  const [buscaGrupoGc, setBuscaGrupoGc] = useState('');
  const [buscaProdutoGc, setBuscaProdutoGc] = useState('');
  const [carregandoCatalogoGc, setCarregandoCatalogoGc] = useState(false);
  const [previewCalc, setPreviewCalc] = useState<PreviewPersiana | null>(null);
  const [previewErro, setPreviewErro] = useState<string | null>(null);
  const [previewCarregando, setPreviewCarregando] = useState(false);
  const [previewForm, setPreviewForm] = useState({
    largura: '2',
    altura: '1.80',
    tc: '',
    preco_tecido: '100',
    cor_acessorio: 'Branco',
    cor_base: 'Branco',
  });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [restaurarAberto, setRestaurarAberto] = useState(false);

  // Estados do Editor de Persiana
  const [editandoCalc, setEditandoCalc] = useState<CalculadoraPersiana | null>(null);
  const [abaVariante, setAbaVariante] = useState<VarianteKey>('com_bando');
  
  // Estados do Editor de Cortina
  const [editandoCortina, setEditandoCortina] = useState<CalculadoraCortina | null>(null);
  
  // Estado compartilhado de criação
  const [criandoNova, setCriandoNova] = useState(false);

  // Carrega as calculadoras do backend
  async function carregar() {
    setCarregando(true);
    try {
      const [rPersiana, rCortina] = await Promise.all([
        api.get<{ calculadoras: CalculadoraPersiana[] }>('/admin/calculadoras'),
        api.get<{ calculadoras: CalculadoraCortina[] }>('/admin/calculadoras-cortina')
      ]);
      setCalculadorasPersiana(rPersiana.calculadoras);
      setCalculadorasCortina(rCortina.calculadoras);
    } catch (e) {
      showToast('error', 'Falha ao carregar calculadoras', e instanceof ApiError ? e.message : '');
    } finally {
      setCarregando(false);
    }
  }

  async function carregarGruposGc() {
    if (gruposGc.length > 0 || carregandoCatalogoGc) return;
    setCarregandoCatalogoGc(true);
    try {
      const r = await api.get<{ grupos: GrupoProdutoGc[]; gc_offline?: boolean }>('/admin/gc/grupos-produtos');
      setGruposGc(r.grupos);
      setGcOffline(Boolean(r.gc_offline));
    } catch (e) {
      setGcOffline(true);
      showToast('error', 'Falha ao carregar grupos do GestãoClick', e instanceof ApiError ? e.message : '');
    } finally {
      setCarregandoCatalogoGc(false);
    }
  }

  async function carregarProdutosGc(grupoId: string) {
    setGrupoProdutosSelecionado(grupoId);
    if (!grupoId) {
      setProdutosGc([]);
      return;
    }
    setCarregandoCatalogoGc(true);
    try {
      const r = await api.get<{ produtos: ProdutoGcResumo[]; gc_offline?: boolean }>(`/admin/gc/produtos?grupo_id=${encodeURIComponent(grupoId)}`);
      setProdutosGc(r.produtos);
      setGcOffline(Boolean(r.gc_offline));
    } catch (e) {
      setGcOffline(true);
      showToast('error', 'Falha ao carregar produtos do GestãoClick', e instanceof ApiError ? e.message : '');
    } finally {
      setCarregandoCatalogoGc(false);
    }
  }

  async function gerarPreviewPersiana() {
    if (!editandoCalc) return;
    setPreviewCarregando(true);
    setPreviewErro(null);
    try {
      const r = await api.post<{ preview: PreviewPersiana }>('/admin/calculadoras/preview-persiana', {
        calculadora: editandoCalc,
        variante: abaVariante,
        largura: Number(previewForm.largura),
        altura: Number(previewForm.altura),
        tc: previewForm.tc === '' ? undefined : Number(previewForm.tc),
        preco_tecido: Number(previewForm.preco_tecido),
        cor_acessorio: previewForm.cor_acessorio,
        cor_base: previewForm.cor_base,
      });
      setPreviewCalc(r.preview);
    } catch (e) {
      setPreviewCalc(null);
      setPreviewErro(e instanceof ApiError ? e.message : 'Não foi possível gerar a prévia.');
    } finally {
      setPreviewCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (editandoCalc) void carregarGruposGc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editandoCalc]);

  useEffect(() => {
    setPreviewCalc(null);
    setPreviewErro(null);
  }, [editandoCalc?.id, abaVariante]);

  // Salva a lista inteira de persiana de volta no servidor
  async function salvarPersianas(lista: CalculadoraPersiana[]) {
    setSalvando(true);
    try {
      const r = await api.put<{ calculadoras: CalculadoraPersiana[] }>('/admin/calculadoras', { calculadoras: lista });
      setCalculadorasPersiana(r.calculadoras);
      showToast('success', 'Calculadoras de Persiana salvas', 'As novas calculadoras e fórmulas já estão em vigor.');
      setEditandoCalc(null);
      setCriandoNova(false);
    } catch (e) {
      showToast('error', 'Falha ao salvar', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  // Salva a lista inteira de cortina de volta no servidor
  async function salvarCortinas(lista: CalculadoraCortina[]) {
    setSalvando(true);
    try {
      const r = await api.put<{ calculadoras: CalculadoraCortina[] }>('/admin/calculadoras-cortina', { calculadoras: lista });
      setCalculadorasCortina(r.calculadoras);
      showToast('success', 'Calculadoras de Cortina salvas', 'Os novos modelos de cortina já estão em vigor.');
      setEditandoCortina(null);
      setCriandoNova(false);
    } catch (e) {
      showToast('error', 'Falha ao salvar', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  // Abre form de edição para uma calculadora de persiana existente
  function iniciarEdicaoPersiana(calc: CalculadoraPersiana) {
    setEditandoCalc(JSON.parse(JSON.stringify(calc)));
    setEditandoCortina(null);
    setCriandoNova(false);
    setAbaVariante('com_bando');
  }

  // Abre form de edição para uma calculadora de cortina existente
  function iniciarEdicaoCortina(calc: CalculadoraCortina) {
    setEditandoCortina(JSON.parse(JSON.stringify(calc)));
    setEditandoCalc(null);
    setCriandoNova(false);
  }

  function iniciarDuplicacaoPersiana(calc: CalculadoraPersiana) {
    const clone = JSON.parse(JSON.stringify(calc));
    clone.id = `${calc.id}_copia`;
    clone.nome = `${calc.nome} (Cópia)`;
    clone.ativo = true;
    setEditandoCalc(clone);
    setEditandoCortina(null);
    setCriandoNova(true);
    setAbaVariante('com_bando');
  }

  function iniciarDuplicacaoCortina(calc: CalculadoraCortina) {
    const clone = JSON.parse(JSON.stringify(calc));
    clone.id = `${calc.id}_copia`;
    clone.nome = `${calc.nome} (Cópia)`;
    clone.ativo = true;
    setEditandoCortina(clone);
    setEditandoCalc(null);
    setCriandoNova(true);
  }

  // Inicializa uma nova calculadora de persiana limpa
  function iniciarCriacaoPersiana() {
    const nova: CalculadoraPersiana = {
      id: '',
      nome: '',
      db_tipo_produto: 'persiana_rolo_blackout',
      codigo_gc: '',
      familia: 'rolo_bk_translucido',
      tecido_grupo_ids: [],
      margem: 0.15,
      dobrar_altura: false,
      base_venda: 'dimensao',
      fator_venda: 1.0,
      mao_de_obra: 'MÃO DE OBRA PERSIANA',
      ativo: true,
      receitas: {
        com_bando: { componentes: [], tecido_qtd: '(ALTURA+0.2)' },
        sem_bando: { componentes: [], tecido_qtd: '(ALTURA+0.2)' },
      },
    };
    setEditandoCalc(nova);
    setEditandoCortina(null);
    setCriandoNova(true);
    setAbaVariante('com_bando');
  }

  // Inicializa uma nova calculadora de cortina limpa
  function iniciarCriacaoCortina() {
    const nova: CalculadoraCortina = {
      id: '',
      nome: '',
      db_tipo_produto: 'cortina',
      codigo_gc: '',
      modelo_base: 'wave',
      fixacao_default: 'trilho',
      tamanho_barra_default: 0.10,
      tipo_barra_default: 'dupla',
      aberturas_default: 1,
      ativo: true,
      camadas: [
        {
          id: 'camada_frente',
          nome: 'Frente',
          modelo_default: 'wave',
          franzido_default: 2.7,
        }
      ]
    };
    setEditandoCortina(nova);
    setEditandoCalc(null);
    setCriandoNova(true);
  }

  // Salva no estado local a calculadora que está em edição
  function aplicarEdicaoPersiana() {
    if (!editandoCalc) return;
    if (!editandoCalc.id.trim()) {
      showToast('warning', 'Identificador obrigatório', 'O ID único da calculadora é necessário.');
      return;
    }
    if (!editandoCalc.nome.trim()) {
      showToast('warning', 'Nome obrigatório', 'O Nome de exibição é necessário.');
      return;
    }

    // Validação básica de fórmulas
    for (const vKey of VARIANTES) {
      const rec = editandoCalc.receitas[vKey.key];
      if (rec) {
        if (!rec.tecido_qtd.trim()) {
          showToast('warning', 'Fórmula de Tecido ausente', `Defina a fórmula do tecido na variante "${vKey.label}".`);
          return;
        }
        for (const c of rec.componentes) {
          if (!c.codigo_interno.trim() || !c.descricao.trim() || !c.qtd.trim()) {
            showToast('warning', 'Componente incompleto', 'Preencha todos os campos dos componentes cadastrados.');
            return;
          }
        }
      }
    }

    let novaLista = [...calculadorasPersiana];
    if (criandoNova) {
      if (calculadorasPersiana.some((c) => c.id === editandoCalc.id)) {
        showToast('error', 'ID duplicado', 'Já existe uma calculadora com este Identificador único.');
        return;
      }
      novaLista.push(editandoCalc);
    } else {
      novaLista = novaLista.map((c) => (c.id === editandoCalc.id ? editandoCalc : c));
    }

    salvarPersianas(novaLista);
  }

  // Salva no estado local a calculadora de cortina em edição
  function aplicarEdicaoCortina() {
    if (!editandoCortina) return;
    if (!editandoCortina.id.trim()) {
      showToast('warning', 'Identificador obrigatório', 'O ID único do modelo é necessário.');
      return;
    }
    if (!editandoCortina.nome.trim()) {
      showToast('warning', 'Nome obrigatório', 'O Nome de exibição é necessário.');
      return;
    }
    if (editandoCortina.camadas.length === 0) {
      showToast('warning', 'Camadas necessárias', 'Insira ao menos uma camada de tecido para a cortina.');
      return;
    }

    // Validação básica das camadas
    for (const cam of editandoCortina.camadas) {
      if (!cam.nome.trim()) {
        showToast('warning', 'Nome da Camada obrigatório', 'Defina o nome de exibição de todas as camadas.');
        return;
      }
    }

    let novaLista = [...calculadorasCortina];
    if (criandoNova) {
      if (calculadorasCortina.some((c) => c.id === editandoCortina.id)) {
        showToast('error', 'ID duplicado', 'Já existe um modelo com este Identificador único.');
        return;
      }
      novaLista.push(editandoCortina);
    } else {
      novaLista = novaLista.map((c) => (c.id === editandoCortina.id ? editandoCortina : c));
    }

    salvarCortinas(novaLista);
  }

  // Remove uma calculadora
  function deletarPersiana(id: string) {
    const confirmada = window.confirm('Deseja realmente remover esta calculadora de persiana? Esta ação é irreversível.');
    if (!confirmada) return;
    const novaLista = calculadorasPersiana.filter((c) => c.id !== id);
    salvarPersianas(novaLista);
  }

  function alternarAtivoPersiana(calc: CalculadoraPersiana) {
    const ativa = calc.ativo !== false;
    const novaLista = calculadorasPersiana.map((c) => (c.id === calc.id ? { ...c, ativo: !ativa } : c));
    salvarPersianas(novaLista);
  }

  function deletarCortina(id: string) {
    const confirmada = window.confirm('Deseja realmente remover este modelo de cortina? Esta ação é irreversível.');
    if (!confirmada) return;
    const novaLista = calculadorasCortina.filter((c) => c.id !== id);
    salvarCortinas(novaLista);
  }

  function alternarAtivoCortina(calc: CalculadoraCortina) {
    const ativa = calc.ativo !== false;
    const novaLista = calculadorasCortina.map((c) => (c.id === calc.id ? { ...c, ativo: !ativa } : c));
    salvarCortinas(novaLista);
  }

  function obterComponentesFiltrados(modeloBase: string, fixacaoDefault: string, tipoBarra: string) {
    const list: { nome: string; formula: string }[] = [];
    const varaoDuplo = tipoBarra === 'dupla';
    
    const nomeBarra = fixacaoDefault === 'trilho' ? 'Trilho' : fixacaoDefault === 'varao_suico' ? 'Varão suíço' : 'Varão';
    list.push({
      nome: nomeBarra,
      formula: 'LARGURA (m)'
    });
    if (varaoDuplo) {
      list.push({
        nome: `${nomeBarra} (traseiro)`,
        formula: 'LARGURA (m)'
      });
    }

    if (modeloBase === 'wave') {
      list.push({
        nome: 'Fita wave',
        formula: 'Se emenda: CONSUMO (franzido) | Se normal: METRAGEM TECIDO (m)'
      });
    }
    
    const temEntretela = ['wave', 'prega', 'franzido'].includes(modeloBase);
    if (temEntretela) {
      list.push({
        nome: 'Entretela (KOS)',
        formula: 'Se emenda: CONSUMO (franzido) | Se normal: METRAGEM TECIDO (m)'
      });
    }

    if (modeloBase === 'wave') {
      list.push({
        nome: 'Cordão wave',
        formula: '(Botões - 1) × 0.06 m'
      });
      list.push({
        nome: 'Rodízio wave',
        formula: 'Teto(LARGURA / 0.06 + 1) arred. múltiplo de 4 (un)'
      });
      list.push({
        nome: 'Base click',
        formula: 'Mesma quantidade de Rodízios wave (un)'
      });
    }

    if (modeloBase === 'ilhos') {
      list.push({
        nome: 'Ilhoses',
        formula: 'Teto(CONSUMO / 0.15) arred. múltiplo de 2 ou 4 (un)'
      });
    }

    if (modeloBase !== 'wave') {
      const nomeFerragem = fixacaoDefault === 'varao' ? 'Argolas' : 'Rodízios/ganchos';
      list.push({
        nome: nomeFerragem,
        formula: 'Teto(LARGURA / 0.10) arred. para par (un)'
      });
      if (varaoDuplo) {
        list.push({
          nome: `${nomeFerragem} (traseiro)`,
          formula: 'Teto(LARGURA / 0.10) arred. para par (un)'
        });
      }
    }

    if (fixacaoDefault !== 'trilho') {
      list.push({
        nome: 'Ponteira',
        formula: '2 unidades'
      });
      if (varaoDuplo) {
        list.push({
          nome: 'Ponteira (traseira)',
          formula: '2 unidades'
        });
      }
    }

    if (fixacaoDefault === 'trilho' || fixacaoDefault === 'varao_suico') {
      list.push({
        nome: 'Terminais',
        formula: '4 unidades'
      });
    }

    list.push({
      nome: varaoDuplo ? 'Suporte duplo' : 'Suporte',
      formula: 'Entrada manual conforme necessidade física de fixação'
    });

    return list;
  }

  // Restaura o banco para o estado padrão
  async function restaurarPadroes() {
    setRestaurarAberto(false);
    setCarregando(true);
    try {
      if (secaoAtiva === 'persiana') {
        const r = await api.put<{ calculadoras: CalculadoraPersiana[] }>('/admin/calculadoras', { calculadoras: null });
        setCalculadorasPersiana(r.calculadoras);
        showToast('success', 'Padrões restaurados', 'Calculadoras de persiana redefinidas para os valores padrões.');
      } else {
        const r = await api.put<{ calculadoras: CalculadoraCortina[] }>('/admin/calculadoras-cortina', { calculadoras: null });
        setCalculadorasCortina(r.calculadoras);
        showToast('success', 'Padrões restaurados', 'Modelos de cortina redefinidos para os valores padrões.');
      }
    } catch (e) {
      showToast('error', 'Falha ao restaurar padrões', e instanceof ApiError ? e.message : '');
    } finally {
      setCarregando(false);
    }
  }

  // Helpers para persistência de variante de persiana
  function toggleVariante(vKey: VarianteKey, ativado: boolean) {
    if (!editandoCalc) return;
    const n = { ...editandoCalc };
    if (ativado) {
      n.receitas[vKey] = { componentes: [], tecido_qtd: '(ALTURA+0.2)' };
    } else {
      delete n.receitas[vKey];
    }
    setEditandoCalc(n);
  }

  function atualizarReceita(vKey: VarianteKey, patch: Partial<ReceitaCalculadora>) {
    if (!editandoCalc) return;
    const n = { ...editandoCalc };
    const rec = n.receitas[vKey] ?? { componentes: [], tecido_qtd: '' };
    n.receitas[vKey] = { ...rec, ...patch };
    setEditandoCalc(n);
  }

  function adicionarComponente(vKey: VarianteKey) {
    if (!editandoCalc) return;
    const rec = editandoCalc.receitas[vKey];
    if (!rec) return;
    const comps = [...rec.componentes, { codigo_interno: '', descricao: '', qtd: '1' }];
    atualizarReceita(vKey, { componentes: comps });
  }

  function removerComponente(vKey: VarianteKey, cIdx: number) {
    if (!editandoCalc) return;
    const rec = editandoCalc.receitas[vKey];
    if (!rec) return;
    const comps = rec.componentes.filter((_, i) => i !== cIdx);
    atualizarReceita(vKey, { componentes: comps });
  }

  function atualizarComponente(vKey: VarianteKey, cIdx: number, patch: Partial<ComponenteCalculadora>) {
    if (!editandoCalc) return;
    const rec = editandoCalc.receitas[vKey];
    if (!rec) return;
    const comps = rec.componentes.map((c, i) => (i === cIdx ? { ...c, ...patch } : c));
    atualizarReceita(vKey, { componentes: comps });
  }

  function gruposTecidoCalc(): string[] {
    return editandoCalc?.tecido_grupo_ids ?? [];
  }

  function adicionarGrupoTecido(grupoId: string) {
    if (!editandoCalc) return;
    const id = grupoId.trim();
    if (!id) return;
    const atuais = gruposTecidoCalc();
    if (atuais.includes(id)) return;
    setEditandoCalc({ ...editandoCalc, tecido_grupo_ids: [...atuais, id] });
  }

  function removerGrupoTecido(grupoId: string) {
    if (!editandoCalc) return;
    setEditandoCalc({ ...editandoCalc, tecido_grupo_ids: gruposTecidoCalc().filter((id) => id !== grupoId) });
  }

  function nomeGrupoGc(id: string): string {
    const grupo = gruposGc.find((g) => g.id === id);
    return grupo ? `${grupo.id} - ${grupo.nome}` : id;
  }

  // Helpers para camadas de cortina
  function adicionarCamadaCortina() {
    if (!editandoCortina) return;
    if (editandoCortina.camadas.length >= 3) return;
    const nIdx = editandoCortina.camadas.length + 1;
    const nova: CamadaCalculadoraCortina = {
      id: `camada_${Date.now()}`,
      nome: nIdx === 2 ? 'Forro/Trás' : `Camada ${nIdx}`,
      modelo_default: 'franzido',
      franzido_default: 2.0
    };
    setEditandoCortina({
      ...editandoCortina,
      camadas: [...editandoCortina.camadas, nova]
    });
  }

  function removerCamadaCortina(idx: number) {
    if (!editandoCortina) return;
    if (editandoCortina.camadas.length <= 1) return;
    const novasCamadas = editandoCortina.camadas.filter((_, i) => i !== idx);
    setEditandoCortina({
      ...editandoCortina,
      camadas: novasCamadas
    });
  }

  function atualizarCamadaCortina(idx: number, patch: Partial<CamadaCalculadoraCortina>) {
    if (!editandoCortina) return;
    const novasCamadas = editandoCortina.camadas.map((c, i) => i === idx ? { ...c, ...patch } : c);
    setEditandoCortina({
      ...editandoCortina,
      camadas: novasCamadas
    });
  }

  if (carregando) {
    return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando calculadoras…</div>;
  }

  const editorAberto = editandoCalc !== null || editandoCortina !== null;
  const termoGrupo = buscaGrupoGc.trim().toLowerCase();
  const gruposFiltrados = gruposGc
    .filter((g) => !termoGrupo || `${g.id} ${g.nome} ${g.grupo_pai_id ?? ''}`.toLowerCase().includes(termoGrupo))
    .slice(0, 80);
  const termoProduto = buscaProdutoGc.trim().toLowerCase();
  const produtosFiltrados = produtosGc
    .filter((p) => !termoProduto || `${p.id} ${p.codigo_interno} ${p.nome} ${p.nome_grupo}`.toLowerCase().includes(termoProduto))
    .slice(0, 80);

  return (
    <div>
      {/* SELETOR DE ABA (APENAS SE NÃO ESTIVER EDITANDO) */}
      {!editorAberto && (
        <div className="flex justify-between items-center mb-6">
          <div className="flex border-b border-neutral-300 w-full max-w-md">
            <button
              className={`py-3 px-6 font-semibold flex items-center gap-2 transition-all ${
                secaoAtiva === 'persiana'
                  ? 'border-b-2 border-primary text-primary font-bold'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
              onClick={() => setSecaoAtiva('persiana')}
            >
              <FontAwesomeIcon icon={faScroll} /> Persianas
            </button>
            <button
              className={`py-3 px-6 font-semibold flex items-center gap-2 transition-all ${
                secaoAtiva === 'cortina'
                  ? 'border-b-2 border-primary text-primary font-bold'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
              onClick={() => setSecaoAtiva('cortina')}
            >
              <FontAwesomeIcon icon={faLayerGroup} /> Cortinas (Modelos)
            </button>
          </div>
          
          <div className="flex gap-2">
            <button className="btn btn-default" onClick={() => setRestaurarAberto(true)}>
              <FontAwesomeIcon icon={faRotateLeft} /> Restaurar Padrões
            </button>
            <button 
              className="btn btn-primary" 
              onClick={secaoAtiva === 'persiana' ? iniciarCriacaoPersiana : iniciarCriacaoCortina}
            >
              <FontAwesomeIcon icon={faPlus} /> {secaoAtiva === 'persiana' ? 'Nova Persiana' : 'Novo Modelo Cortina'}
            </button>
          </div>
        </div>
      )}

      {/* SEÇÃO PERSIANA */}
      {secaoAtiva === 'persiana' && (
        <div>
          {!editandoCalc ? (
            // LISTAGEM DE CALCULADORAS DE PERSIANA
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {calculadorasPersiana.map((c) => {
                const ativa = c.ativo !== false;
                return (
                <div key={c.id} className="card p-4 flex flex-col justify-between hover:shadow-md transition-shadow" style={{ opacity: ativa ? 1 : 0.62 }}>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-md-ui text-neutral-800">{c.nome}</span>
                        {!ativa && <span className="badge badge-secondary w-fit">Inativa</span>}
                      </div>
                      <span className="text-2xs-ui bg-neutral-200 px-2 py-0.5 rounded-sm font-mono text-neutral-600">ID: {c.id}</span>
                    </div>
                    <div className="space-y-1 mb-4 text-xs-ui text-neutral-500">
                      <p><strong>Família:</strong> {FAMILIAS.find((f) => f.value === c.familia)?.label ?? c.familia}</p>
                      <p><strong>Tipo-base BD:</strong> {DB_TIPOS_PRODUTO.find((d) => d.value === c.db_tipo_produto)?.label ?? c.db_tipo_produto}</p>
                      <p><strong>Grupos tecido GC:</strong> {c.tecido_grupo_ids?.length ? c.tecido_grupo_ids.join(', ') : 'Padrão'}</p>
                      <p><strong>Variantes Ativas:</strong> {VARIANTES.filter((v) => c.receitas[v.key] !== undefined).map((v) => v.label).join(', ')}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3 mt-auto">
                    <button className="btn btn-default btn-xs flex-1" onClick={() => iniciarEdicaoPersiana(c)}>
                      <FontAwesomeIcon icon={faPen} /> Editar
                    </button>
                    <button className="btn btn-default btn-xs text-primary flex-1" onClick={() => iniciarDuplicacaoPersiana(c)}>
                      <FontAwesomeIcon icon={faCopy} /> Duplicar
                    </button>
                    <button className={`btn btn-default btn-xs flex-1 ${ativa ? 'text-warning' : 'text-success'}`} onClick={() => alternarAtivoPersiana(c)}>
                      <FontAwesomeIcon icon={ativa ? faBan : faCircleCheck} /> {ativa ? 'Inativar' : 'Reativar'}
                    </button>
                    <button className="btn btn-default btn-xs text-error flex-1" onClick={() => deletarPersiana(c.id)}>
                      <FontAwesomeIcon icon={faTrash} /> Excluir
                    </button>
                  </div>
                </div>
              );})}
            </div>
          ) : (
            // EDITOR DE CALCULADORA DE PERSIANA
            <div className="card p-6">
              <div className="flex justify-between items-center mb-6 pb-2 border-b border-neutral-200">
                <h3 className="text-lg-ui font-bold text-neutral-800">
                  {criandoNova ? 'Criar Nova Calculadora' : `Editar Calculadora: ${editandoCalc.nome}`}
                </h3>
                <button className="btn btn-default btn-sm" onClick={() => setEditandoCalc(null)}>
                  <FontAwesomeIcon icon={faXmark} /> Voltar à lista
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Metadados Gerais (Esquerda) */}
                <div className="lg:col-span-1 space-y-4 border-r border-neutral-200 pr-0 lg:pr-6">
                  <h4 className="text-md-ui font-semibold text-neutral-700 flex items-center gap-2">
                    <FontAwesomeIcon icon={faSliders} /> Metadados Gerais
                  </h4>

                  <div>
                    <label className="form-label">Identificador Único (ID)<span className="label-required">*</span></label>
                    <input
                      className="input font-mono"
                      type="text"
                      disabled={!criandoNova}
                      placeholder="ex: persiana_rolo_premium"
                      value={editandoCalc.id}
                      onChange={(e) => setEditandoCalc({ ...editandoCalc, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    />
                    {criandoNova && <div className="helper-text">Apenas minúsculas, números e sublinhados (_). Não pode ser alterado depois.</div>}
                  </div>

                  <div>
                    <label className="form-label">Nome de Exibição<span className="label-required">*</span></label>
                    <input
                      className="input"
                      type="text"
                      placeholder="ex: Persiana Rolo Premium"
                      value={editandoCalc.nome}
                      onChange={(e) => setEditandoCalc({ ...editandoCalc, nome: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">ID do Produto Base no GestãoClick<span className="label-required">*</span></label>
                    <input
                      className="input font-mono"
                      type="text"
                      placeholder="ex: 2591"
                      value={editandoCalc.codigo_gc}
                      onChange={(e) => setEditandoCalc({ ...editandoCalc, codigo_gc: e.target.value })}
                    />
                    <div className="helper-text">Usado como referência de integração do modelo. Componentes usam código interno próprio.</div>
                  </div>

                  <div className="border border-neutral-300 rounded-sm bg-neutral-50 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h5 className="text-sm-ui font-bold text-neutral-800">Catálogo GestãoClick</h5>
                        <div className="helper-text">Use os grupos para definir quais tecidos aparecem nesta calculadora.</div>
                      </div>
                      <button type="button" className="btn btn-default btn-xs" onClick={() => void carregarGruposGc()} disabled={carregandoCatalogoGc}>
                        {carregandoCatalogoGc ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faRotateLeft} />} Atualizar
                      </button>
                    </div>

                    {gcOffline && (
                      <div className="text-xs-ui text-error font-semibold">GestãoClick indisponível para consulta de catálogo.</div>
                    )}

                    <div>
                      <label className="form-label">Grupos/Subgrupos de Tecido</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {gruposTecidoCalc().map((id) => (
                          <span key={id} className="badge badge-secondary flex items-center gap-2">
                            {nomeGrupoGc(id)}
                            <button type="button" className="text-error" onClick={() => removerGrupoTecido(id)} title="Remover grupo">
                              <FontAwesomeIcon icon={faXmark} />
                            </button>
                          </span>
                        ))}
                        {gruposTecidoCalc().length === 0 && (
                          <span className="text-xs-ui text-neutral-500">Sem grupo configurado: usa o filtro padrão do modelo base.</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="input input-xs"
                          placeholder="Buscar grupo por nome ou ID"
                          value={buscaGrupoGc}
                          onChange={(e) => setBuscaGrupoGc(e.target.value)}
                        />
                        <span className="btn btn-default btn-xs" aria-hidden="true"><FontAwesomeIcon icon={faMagnifyingGlass} /></span>
                      </div>
                      {buscaGrupoGc.trim() && (
                        <div className="mt-2 border border-neutral-300 bg-surface-card rounded-sm max-h-44 overflow-y-auto">
                          {gruposFiltrados.length === 0 ? (
                            <div className="px-2 py-2 text-xs-ui text-neutral-500">Nenhum grupo encontrado.</div>
                          ) : gruposFiltrados.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              className="block w-full text-left px-2 py-1.5 text-xs-ui border-b border-neutral-200 hover:bg-neutral-100"
                              onClick={() => {
                                adicionarGrupoTecido(g.id);
                                setBuscaGrupoGc('');
                              }}
                            >
                              <span className="font-mono text-neutral-700">{g.id}</span>
                              <span className="text-neutral-800"> - {g.nome}</span>
                              {g.grupo_pai_id && <span className="text-neutral-500"> pai {g.grupo_pai_id}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="form-label">Consultar Produtos/Componentes</label>
                      <div className="grid grid-cols-1 gap-2">
                        <select
                          className="input input-xs"
                          value={grupoProdutosSelecionado}
                          onChange={(e) => void carregarProdutosGc(e.target.value)}
                        >
                          <option value="">Selecione um grupo do GestãoClick…</option>
                          {gruposGc.map((g) => (
                            <option key={g.id} value={g.id}>{g.id} - {g.nome}</option>
                          ))}
                        </select>
                        <input
                          className="input input-xs"
                          placeholder="Filtrar produtos por nome, ID ou código interno"
                          value={buscaProdutoGc}
                          onChange={(e) => setBuscaProdutoGc(e.target.value)}
                          disabled={!grupoProdutosSelecionado}
                        />
                      </div>
                      {grupoProdutosSelecionado && (
                        <div className="mt-2 border border-neutral-300 bg-surface-card rounded-sm max-h-44 overflow-y-auto">
                          {produtosFiltrados.length === 0 ? (
                            <div className="px-2 py-2 text-xs-ui text-neutral-500">Nenhum produto carregado.</div>
                          ) : produtosFiltrados.map((p) => (
                            <div key={p.id} className="px-2 py-1.5 text-xs-ui border-b border-neutral-200">
                              <div className="font-semibold text-neutral-800">{p.nome}</div>
                              <div className="font-mono text-neutral-600">ID {p.id} · Código interno {p.codigo_interno || '-'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Família Física</label>
                      <select
                        className="input"
                        value={editandoCalc.familia}
                        onChange={(e) => setEditandoCalc({ ...editandoCalc, familia: e.target.value as any })}
                      >
                        {FAMILIAS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Tipo-base no Banco</label>
                      <select
                        className="input"
                        value={editandoCalc.db_tipo_produto}
                        onChange={(e) => setEditandoCalc({ ...editandoCalc, db_tipo_produto: e.target.value })}
                      >
                        {DB_TIPOS_PRODUTO.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                      <div className="helper-text">Compatibilidade para salvar o orçamento. O ID real da calculadora continua podendo ser novo.</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Margem Adicional (m)</label>
                      <input
                        className="input"
                        type="number"
                        step={0.01}
                        value={editandoCalc.margem}
                        onChange={(e) => setEditandoCalc({ ...editandoCalc, margem: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="form-label">Fator Venda</label>
                      <input
                        className="input"
                        type="number"
                        step={0.1}
                        value={editandoCalc.fator_venda}
                        onChange={(e) => setEditandoCalc({ ...editandoCalc, fator_venda: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Fórmula Base Venda</label>
                    <select
                      className="input"
                      value={editandoCalc.base_venda}
                      onChange={(e) => setEditandoCalc({ ...editandoCalc, base_venda: e.target.value as any })}
                    >
                      <option value="dimensao">Dimensão (Rolo Cheio)</option>
                      <option value="largura">Largura Real</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Descrição Mão de Obra</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="ex: MÃO DE OBRA PERSIANA ROLO"
                      value={editandoCalc.mao_de_obra}
                      onChange={(e) => setEditandoCalc({ ...editandoCalc, mao_de_obra: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      id="dobrar-alt"
                      type="checkbox"
                      checked={editandoCalc.dobrar_altura}
                      onChange={(e) => setEditandoCalc({ ...editandoCalc, dobrar_altura: e.target.checked })}
                      style={{ accentColor: 'var(--action-add)', width: 18, height: 18 }}
                    />
                    <label htmlFor="dobrar-alt" className="text-sm-ui font-semibold text-neutral-700 cursor-pointer">
                      Dobrar Altura no Cálculo (Double Vision)
                    </label>
                  </div>
                </div>

                {/* Configuração de Receitas e Componentes (Direita/Centro) */}
                <div className="lg:col-span-2 space-y-4">
                  <h4 className="text-md-ui font-semibold text-neutral-700 flex items-center gap-2">
                    <FontAwesomeIcon icon={faCubes} /> Fórmulas e Componentes por Variante
                  </h4>

                  {/* Seletor de Variante Ativa */}
                  <div className="flex flex-wrap gap-4 border-b border-neutral-300 pb-2">
                    {VARIANTES.map((v) => {
                      const ativo = editandoCalc.receitas[v.key] !== undefined;
                      const selecionada = abaVariante === v.key;
                      return (
                        <button
                          key={v.key}
                          type="button"
                          className={`btn btn-xs ${selecionada ? 'btn-primary' : 'btn-default'}`}
                          onClick={() => setAbaVariante(v.key)}
                        >
                          <span className={`w-2 h-2 rounded-full mr-2 inline-block ${ativo ? 'bg-success' : 'bg-neutral-400'}`} />
                          {v.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Detalhe da Variante Selecionada */}
                  {(() => {
                    const rec = editandoCalc.receitas[abaVariante];
                    if (!rec) {
                      return (
                        <div className="p-6 text-center border border-dashed border-neutral-300 rounded-sm bg-neutral-50 text-sm-ui text-neutral-500">
                          <p className="mb-3">Esta variante está <strong>desativada</strong> para esta calculadora.</p>
                          <button
                            type="button"
                            className="btn btn-default btn-xs"
                            onClick={() => toggleVariante(abaVariante, true)}
                          >
                            Ativar Variante
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-neutral-50 p-3 border border-neutral-300 rounded-sm">
                          <div>
                            <span className="font-semibold text-sm-ui text-neutral-700">Variante habilitada</span>
                            <p className="text-2xs-ui text-neutral-500">Contém as regras de componentes e tecidos.</p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-default btn-xs text-error"
                            onClick={() => toggleVariante(abaVariante, false)}
                          >
                            Desativar Variante
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Fórmula de Quantidade do Tecido<span className="label-required">*</span></label>
                            <input
                              className="input font-mono"
                              type="text"
                              placeholder="ex: (ALTURA+0.2)"
                              value={rec.tecido_qtd}
                              onChange={(e) => atualizarReceita(abaVariante, { tecido_qtd: e.target.value })}
                            />
                          </div>
                          <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 flex flex-col justify-center">
                            <span className="text-xs-ui font-bold text-neutral-600 flex items-center gap-1">
                              <FontAwesomeIcon icon={faCircleInfo} /> Variáveis Permitidas:
                            </span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {['LARGURA', 'ALTURA', 'TC', 'CAVALETES', 'HASTES'].map((item) => (
                                <span key={item} className="text-2xs-ui font-mono bg-neutral-200 px-1 py-0.5 rounded-sm text-neutral-700">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="form-label mb-0">Componentes da Lista Técnica / Custo</span>
                            <button
                              type="button"
                              className="btn btn-default btn-xs"
                              onClick={() => adicionarComponente(abaVariante)}
                            >
                              <FontAwesomeIcon icon={faPlus} /> Adicionar Componente
                            </button>
                          </div>

                          <table className="w-full text-xs-ui" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr className="border-b border-neutral-300 text-neutral-500 font-semibold">
                                <th className="py-2 text-left" style={{ width: 140 }}>Código Interno (GC)</th>
                                <th className="py-2 text-left">Descrição Componente</th>
                                <th className="py-2 text-left" style={{ width: 140 }}>Qtd / Fórmula</th>
                                <th className="py-2" style={{ width: 40 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {rec.componentes.map((comp, cIdx) => (
                                <tr key={cIdx} className="border-b border-neutral-200">
                                  <td className="py-2 pr-2">
                                    <input
                                      className="input input-xs font-mono"
                                      type="text"
                                      placeholder="Código GC"
                                      value={comp.codigo_interno}
                                      onChange={(e) => atualizarComponente(abaVariante, cIdx, { codigo_interno: e.target.value })}
                                    />
                                  </td>
                                  <td className="py-2 pr-2">
                                    <input
                                      className="input input-xs"
                                      type="text"
                                      placeholder="Descrição do Componente"
                                      value={comp.descricao}
                                      onChange={(e) => atualizarComponente(abaVariante, cIdx, { descricao: e.target.value })}
                                    />
                                  </td>
                                  <td className="py-2 pr-2">
                                    <input
                                      className="input input-xs font-mono"
                                      type="text"
                                      placeholder="ex: LARGURA/0.5"
                                      value={comp.qtd}
                                      onChange={(e) => atualizarComponente(abaVariante, cIdx, { qtd: e.target.value })}
                                    />
                                  </td>
                                  <td className="py-2 text-center">
                                    <button
                                      type="button"
                                      className="text-error hover:opacity-80"
                                      onClick={() => removerComponente(abaVariante, cIdx)}
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {rec.componentes.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="py-4 text-center text-neutral-400">
                                    Nenhum componente cadastrado para esta variante.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="border border-neutral-300 rounded-sm bg-neutral-50 p-3 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h5 className="text-sm-ui font-bold text-neutral-800">Prévia / Auditoria do Cálculo</h5>
                              <div className="helper-text">Mostra como a receita é resolvida com cor, código interno, preço e fallback.</div>
                            </div>
                            <button type="button" className="btn btn-default btn-xs" disabled={previewCarregando} onClick={() => void gerarPreviewPersiana()}>
                              {previewCarregando ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faMagnifyingGlass} />} Gerar prévia
                            </button>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                            <div>
                              <label className="form-label">Largura</label>
                              <input className="input input-xs" type="number" step={0.01} value={previewForm.largura} onChange={(e) => setPreviewForm({ ...previewForm, largura: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label">Altura</label>
                              <input className="input input-xs" type="number" step={0.01} value={previewForm.altura} onChange={(e) => setPreviewForm({ ...previewForm, altura: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label">TC</label>
                              <input className="input input-xs" type="number" step={0.01} placeholder="auto" value={previewForm.tc} onChange={(e) => setPreviewForm({ ...previewForm, tc: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label">Preço Tecido</label>
                              <input className="input input-xs" type="number" step={0.01} value={previewForm.preco_tecido} onChange={(e) => setPreviewForm({ ...previewForm, preco_tecido: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label">Acessórios</label>
                              <select className="input input-xs" value={previewForm.cor_acessorio} onChange={(e) => setPreviewForm({ ...previewForm, cor_acessorio: e.target.value })}>
                                {['Branco', 'Bege', 'Cinza', 'Preto'].map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="form-label">Base</label>
                              <select className="input input-xs" value={previewForm.cor_base} onChange={(e) => setPreviewForm({ ...previewForm, cor_base: e.target.value })}>
                                {['Branco', 'Bege', 'Cinza', 'Preto'].map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>

                          {previewErro && (
                            <div className="text-xs-ui text-error font-semibold">{previewErro}</div>
                          )}

                          {previewCalc && (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2 text-xs-ui text-neutral-700">
                                <span className="badge badge-secondary">Família: {previewCalc.familia}</span>
                                <span className="badge badge-secondary">Variante: {previewCalc.variante}</span>
                                <span className="badge badge-secondary">Valor: {formatBRL(previewCalc.valor)}</span>
                                <span className="badge badge-secondary">Tecido: {formatQtd(previewCalc.tecido.quantidade)} × {formatBRL(previewCalc.tecido.preco)}</span>
                              </div>
                              <div className="overflow-x-auto border border-neutral-300 rounded-sm bg-surface-card">
                                <table className="w-full text-xs-ui" style={{ borderCollapse: 'collapse', minWidth: 860 }}>
                                  <thead>
                                    <tr className="border-b border-neutral-300 text-neutral-600 font-semibold">
                                      <th className="py-2 px-2 text-left">Componente resolvido</th>
                                      <th className="py-2 px-2 text-left">Origem</th>
                                      <th className="py-2 px-2 text-left">Código</th>
                                      <th className="py-2 px-2 text-right">Qtd</th>
                                      <th className="py-2 px-2 text-right">Preço</th>
                                      <th className="py-2 px-2 text-right">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {previewCalc.itens.map((linha, idxLinha) => (
                                      <tr key={`${linha.codigo_interno}-${idxLinha}`} className="border-b border-neutral-200">
                                        <td className="py-2 px-2">
                                          <div className="font-semibold text-neutral-800">{linha.descricao}</div>
                                          {linha.descricao_original !== linha.descricao && (
                                            <div className="text-2xs-ui text-neutral-500">Original: {linha.descricao_original}</div>
                                          )}
                                          {linha.alerta && <div className="text-2xs-ui text-error font-semibold">{linha.alerta}</div>}
                                        </td>
                                        <td className="py-2 px-2">
                                          <span className={`badge badge-secondary ${linha.origem === 'fallback' ? 'text-error' : linha.origem === 'cor' ? 'text-success' : ''}`}>
                                            {linha.origem === 'fallback' ? 'Fallback' : linha.origem === 'cor' ? 'Cor aplicada' : 'Original'}
                                          </span>
                                        </td>
                                        <td className="py-2 px-2 font-mono text-neutral-700">{linha.codigo_interno || '-'}</td>
                                        <td className="py-2 px-2 text-right font-mono">{formatQtd(linha.quantidade)}</td>
                                        <td className="py-2 px-2 text-right font-mono">{formatBRL(linha.preco)}</td>
                                        <td className="py-2 px-2 text-right font-mono font-semibold">{formatBRL(linha.subtotal)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Ações do Editor de Persiana */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-200">
                <button className="btn btn-default" disabled={salvando} onClick={() => setEditandoCalc(null)}>
                  Cancelar
                </button>
                <button className="btn btn-success" disabled={salvando} onClick={aplicarEdicaoPersiana}>
                  {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar Calculadora</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO CORTINA */}
      {secaoAtiva === 'cortina' && (
        <div>
          {!editandoCortina ? (
            // LISTAGEM DE MODELOS DE CORTINA
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {calculadorasCortina.map((c) => {
                const ativa = c.ativo !== false;
                return (
                <div key={c.id} className="card p-4 flex flex-col justify-between hover:shadow-md transition-shadow" style={{ opacity: ativa ? 1 : 0.62 }}>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-md-ui text-neutral-800">{c.nome}</span>
                        {!ativa && <span className="badge badge-secondary w-fit">Inativa</span>}
                      </div>
                      <span className="text-2xs-ui bg-neutral-200 px-2 py-0.5 rounded-sm font-mono text-neutral-600">ID: {c.id}</span>
                    </div>
                    <div className="space-y-1 mb-4 text-xs-ui text-neutral-500">
                      <p><strong>Modelo Base:</strong> {MODELOS_CORTINA.find((f) => f.value === c.modelo_base)?.label ?? c.modelo_base}</p>
                      <p><strong>Fixação Recomendada:</strong> {FIXACOES_CORTINA.find((f) => f.value === c.fixacao_default)?.label ?? c.fixacao_default}</p>
                      <p><strong>Tamanho Barra:</strong> {c.tamanho_barra_default * 100} cm ({c.tipo_barra_default})</p>
                      <p><strong>Camadas:</strong> {c.camadas.length} ({c.camadas.map((cam) => `${cam.nome}: ${cam.modelo_default}`).join(', ')})</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3 mt-auto">
                    <button className="btn btn-default btn-xs flex-1" onClick={() => iniciarEdicaoCortina(c)}>
                      <FontAwesomeIcon icon={faPen} /> Editar
                    </button>
                    <button className="btn btn-default btn-xs text-primary flex-1" onClick={() => iniciarDuplicacaoCortina(c)}>
                      <FontAwesomeIcon icon={faCopy} /> Duplicar
                    </button>
                    <button className={`btn btn-default btn-xs flex-1 ${ativa ? 'text-warning' : 'text-success'}`} onClick={() => alternarAtivoCortina(c)}>
                      <FontAwesomeIcon icon={ativa ? faBan : faCircleCheck} /> {ativa ? 'Inativar' : 'Reativar'}
                    </button>
                    <button className="btn btn-default btn-xs text-error flex-1" onClick={() => deletarCortina(c.id)}>
                      <FontAwesomeIcon icon={faTrash} /> Excluir
                    </button>
                  </div>
                </div>
              );})}
              {calculadorasCortina.length === 0 && (
                <div className="col-span-full card p-6 text-center text-neutral-400">
                  Nenhum modelo de cortina cadastrado. Clique em "Novo Modelo Cortina" para criar um.
                </div>
              )}
            </div>
          ) : (
            // EDITOR DE MODELO DE CORTINA
            <div className="card p-6">
              <div className="flex justify-between items-center mb-6 pb-2 border-b border-neutral-200">
                <h3 className="text-lg-ui font-bold text-neutral-800">
                  {criandoNova ? 'Criar Novo Modelo de Cortina' : `Editar Modelo: ${editandoCortina.nome}`}
                </h3>
                <button className="btn btn-default btn-sm" onClick={() => setEditandoCortina(null)}>
                  <FontAwesomeIcon icon={faXmark} /> Voltar à lista
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Metadados Gerais (Esquerda) */}
                <div className="lg:col-span-1 space-y-4 border-r border-neutral-200 pr-0 lg:pr-6">
                  <h4 className="text-md-ui font-semibold text-neutral-700 flex items-center gap-2">
                    <FontAwesomeIcon icon={faSliders} /> Configurações do Modelo
                  </h4>

                  <div>
                    <label className="form-label">Identificador Único (ID)<span className="label-required">*</span></label>
                    <input
                      className="input font-mono"
                      type="text"
                      disabled={!criandoNova}
                      placeholder="ex: cortina_wave_premium"
                      value={editandoCortina.id}
                      onChange={(e) => setEditandoCortina({ ...editandoCortina, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    />
                    {criandoNova && <div className="helper-text">Apenas minúsculas, números e sublinhados (_). Não pode ser alterado depois.</div>}
                  </div>

                  <div>
                    <label className="form-label">Nome de Exibição<span className="label-required">*</span></label>
                    <input
                      className="input"
                      type="text"
                      placeholder="ex: Cortina Wave Luxo"
                      value={editandoCortina.nome}
                      onChange={(e) => setEditandoCortina({ ...editandoCortina, nome: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">ID do Produto no GestãoClick (`codigo_gc`) <span className="label-required">*</span></label>
                    <input
                      className="input font-mono"
                      type="text"
                      placeholder="ex: 5913"
                      value={editandoCortina.codigo_gc}
                      onChange={(e) => setEditandoCortina({ ...editandoCortina, codigo_gc: e.target.value })}
                    />
                    <div className="helper-text">ID de sincronização de vendas no ERP.</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Modelo Físico Base</label>
                      <select
                        className="input"
                        value={editandoCortina.modelo_base}
                        onChange={(e) => setEditandoCortina({ ...editandoCortina, modelo_base: e.target.value as any })}
                      >
                        {MODELOS_CORTINA.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Fixação Recomendada</label>
                      <select
                        className="input"
                        value={editandoCortina.fixacao_default}
                        onChange={(e) => setEditandoCortina({ ...editandoCortina, fixacao_default: e.target.value as any })}
                      >
                        {FIXACOES_CORTINA.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Tamanho Barra (cm)</label>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step={1}
                        value={editandoCortina.tamanho_barra_default * 100}
                        onChange={(e) => setEditandoCortina({ ...editandoCortina, tamanho_barra_default: Number(e.target.value) / 100 })}
                      />
                    </div>
                    <div>
                      <label className="form-label">Tipo de Barra</label>
                      <select
                        className="input"
                        value={editandoCortina.tipo_barra_default}
                        onChange={(e) => setEditandoCortina({ ...editandoCortina, tipo_barra_default: e.target.value as any })}
                      >
                        <option value="simples">Simples</option>
                        <option value="dupla">Dupla</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Aberturas Padrão</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={editandoCortina.aberturas_default}
                      onChange={(e) => setEditandoCortina({ ...editandoCortina, aberturas_default: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Configuração de Camadas (Direita/Centro) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-neutral-200">
                    <h4 className="text-md-ui font-semibold text-neutral-700 flex items-center gap-2">
                      <FontAwesomeIcon icon={faCubes} /> Camadas de Tecido ({editandoCortina.camadas.length}/3)
                    </h4>
                    {editandoCortina.camadas.length < 3 && (
                      <button
                        type="button"
                        className="btn btn-default btn-xs"
                        onClick={adicionarCamadaCortina}
                      >
                        <FontAwesomeIcon icon={faPlus} /> Adicionar Camada
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {editandoCortina.camadas.map((cam, idx) => (
                      <div key={cam.id} className="p-4 bg-neutral-50 border border-neutral-300 rounded-sm relative">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-bold text-sm-ui text-neutral-700">
                            {idx === 0 ? 'Camada 1 (Principal / Frente)' : `Camada ${idx + 1}`}
                          </span>
                          {editandoCortina.camadas.length > 1 && (
                            <button
                              type="button"
                              className="text-error hover:opacity-85 text-xs-ui flex items-center gap-1"
                              onClick={() => removerCamadaCortina(idx)}
                            >
                              <FontAwesomeIcon icon={faTrash} /> Remover Camada
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="form-label">Nome de Exibição<span className="label-required">*</span></label>
                            <input
                              className="input"
                              type="text"
                              placeholder="ex: Frente, Forro, Trás"
                              value={cam.nome}
                              onChange={(e) => atualizarCamadaCortina(idx, { nome: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="form-label">Modelo da Camada</label>
                            <select
                              className="input"
                              value={cam.modelo_default}
                              onChange={(e) => atualizarCamadaCortina(idx, { modelo_default: e.target.value as any })}
                            >
                              {MODELOS_CORTINA.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Franzido Padrão / Sugerido</label>
                            <input
                              className="input"
                              type="number"
                              step={0.1}
                              min={1}
                              value={cam.franzido_default ?? ''}
                              onChange={(e) => atualizarCamadaCortina(idx, { franzido_default: e.target.value ? Number(e.target.value) : undefined })}
                              placeholder="Fator default"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lista Técnica de Componentes & Fórmulas de Produção */}
              <div className="mt-6 p-4 bg-neutral-100/50 border border-neutral-300 rounded-sm">
                <h5 className="text-sm-ui font-bold text-neutral-800 mb-2 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faCircleInfo} className="text-primary" />
                  Lista Técnica de Componentes para Produção ({editandoCortina.nome})
                </h5>
                <p className="text-2xs-ui text-neutral-500 mb-3">
                  Os componentes abaixo são os únicos calculados e associados a este modelo específico (com base no modelo base "{editandoCortina.modelo_base}" e fixação "{editandoCortina.fixacao_default}"):
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs-ui text-neutral-600" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="border-b border-neutral-300 text-neutral-500 font-semibold text-left">
                        <th className="py-1 pr-3">Componente</th>
                        <th className="py-1">Fórmula de Cálculo da Qtd / Unidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {obterComponentesFiltrados(editandoCortina.modelo_base, editandoCortina.fixacao_default, editandoCortina.tipo_barra_default).map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 pr-3 font-semibold text-neutral-800">{item.nome}</td>
                          <td className="py-1.5 font-mono text-neutral-700">{item.formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ações do Editor de Cortina */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-200">
                <button className="btn btn-default" disabled={salvando} onClick={() => setEditandoCortina(null)}>
                  Cancelar
                </button>
                <button className="btn btn-success" disabled={salvando} onClick={aplicarEdicaoCortina}>
                  {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar Modelo de Cortina</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO DE RESTAURAÇÃO */}
      <ConfirmModal
        aberto={restaurarAberto}
        titulo="Restaurar Padrões"
        mensagem={`Deseja realmente restaurar todos os modelos padrões de ${
          secaoAtiva === 'persiana' ? 'Persiana' : 'Cortina'
        }? Todas as alterações personalizadas e registros novos serão perdidos.`}
        confirmarLabel="Restaurar"
        cancelarLabel="Voltar"
        perigo
        onConfirmar={restaurarPadroes}
        onCancelar={() => setRestaurarAberto(false)}
      />
    </div>
  );
}
