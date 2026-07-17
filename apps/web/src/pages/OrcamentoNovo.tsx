// apps/web/src/pages/OrcamentoNovo.tsx
// Novo orçamento — TELA ÚNICA (Victor v.3.1): persianas E cortinas no mesmo orçamento.
// O envio decide a rota: só persiana → /orcamentos; só cortina → /orcamentos/cortina;
// os dois → /orcamentos/misto (1 orçamento no GestãoClick com tudo). Instalação por peça.
// - EDIÇÃO de rascunho (?editar=<id>): reabre pré-preenchido (persiana e/ou cortina).
// - AUTOSAVE LOCAL: guarda as duas seções; recupera ao voltar (lib/rascunhoLocal).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faSpinner, faXmark, faRotateLeft, faPaperPlane, faFloppyDisk, faScroll, faLayerGroup, faGripLines, faBoxOpen } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { useGcHealth } from '../hooks/useGcHealth';
import { useToast } from '../hooks/useToast';
import { useNavGuard } from '../hooks/useNavGuard';
import { api, ApiError } from '../lib/api';
import { PersianaForm } from '../components/PersianaForm';
import { CortinaOrcamento, type CortinaOrcamentoEstado } from '../components/CortinaOrcamento';
import { ItensExtrasOrcamento, type ItensExtrasEstado } from '../components/ItensExtrasOrcamento';
import { ClienteSearch } from '../components/ClienteSearch';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatBRL, roundHalfUp } from '../lib/formatacao';
import type { CortinaInicial } from '../components/CortinaCard';
import type { OrcamentoCalculado, ClienteResumo, ItemInput, TipoPersiana, Cor, Acionamento, OrcamentoSalvo } from '../lib/calcTypes';
import type { OrcamentoDetalhe, ItemSnapshot } from '../lib/orcamentoTypes';
import {
  lerRascunhoLocal, salvarRascunhoLocal, limparRascunhoLocal,
  type PersianaSnapshot, type CortinaSnapshot, type ProdutoExtraSnap, type RascunhoLocal,
} from '../lib/rascunhoLocal';

const ESTADO_CORTINA_VAZIO: CortinaOrcamentoEstado = { total: 0, todasCompletas: false, temCortinas: false, count: 0, cortinas: [], totais: [], calculando: false };
const ESTADO_EXTRA_VAZIO: ItensExtrasEstado = { total: 0, count: 0, completos: true, itens: [] };

type Secao = 'persiana' | 'cortina' | 'trilho' | 'avulso';
type FocoEdicaoItem = { secao: Secao; index: number } | null;

// Recuperação: detecta se o rascunho local tem conteúdo real em cada seção (e não só
// os campos vazios iniciais), para reabrir já com a seção certa marcada.
function persianaSnapTemConteudo(s?: PersianaSnapshot | null): boolean {
  if (!s) return false;
  if (s.tipo) return true;
  return s.itens?.some((it) =>
    it.ambiente || it.tecido_id || it.cor || it.acionamento || it.largura || it.altura || it.tc || it.rolamento || it.base) ?? false;
}
function cortinaSnapTemConteudo(s?: CortinaSnapshot | null): boolean {
  if (!s) return false;
  return s.cortinas?.some((c) =>
    c.modelo || c.fixacao || c.largura || c.altura || c.tamanhoBarra || (c.camadas?.some((ca) => ca.tecidoId || ca.franzido))) ?? false;
}
function extrasSnapTemConteudo(s?: ProdutoExtraSnap[] | null): boolean {
  return s?.some((it) => it.produto_id || it.ambiente || it.largura || it.observacao || it.quantidade !== '1') ?? false;
}

export function OrcamentoNovo() {
  const { usuario } = useAuth();
  const { status: gcStatus } = useGcHealth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setDirty } = useNavGuard();
  const [params] = useSearchParams();
  const editarId = params.get('editar');
  const itemFocoParam = params.get('item');

  // Rascunho local recuperado (só fora do modo edição).
  const [rascunhoLocal] = useState<RascunhoLocal | null>(() => (editarId ? null : lerRascunhoLocal()));

  interface Loja { id: string; nome: string }
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [lojaId, setLojaId] = useState<string>(() => rascunhoLocal?.loja_id ?? '');

  useEffect(() => {
    if (usuario?.perfil === 'admin') {
      api.get<{ lojas: Loja[] }>('/admin/lojas')
        .then((r) => setLojas(r.lojas))
        .catch(() => setLojas([]));
    }
  }, [usuario]);

  const [cliente, setCliente] = useState<ClienteResumo | null>(
    rascunhoLocal?.cliente ? { id: rascunhoLocal.cliente.id, nome: rascunhoLocal.cliente.nome, tipo_pessoa: '', documento: null } : null,
  );
  const [resultado, setResultado] = useState<OrcamentoCalculado | null>(null); // persiana
  const [cortinaEstado, setCortinaEstado] = useState<CortinaOrcamentoEstado>(ESTADO_CORTINA_VAZIO);
  const [trilhoEstado, setTrilhoEstado] = useState<ItensExtrasEstado>(ESTADO_EXTRA_VAZIO);
  const [avulsoEstado, setAvulsoEstado] = useState<ItensExtrasEstado>(ESTADO_EXTRA_VAZIO);
  const [persianaCalculando, setPersianaCalculando] = useState(false);
  // O vendedor escolhe o que incluir; cada seção só aparece quando marcada e na
  // ORDEM em que foi selecionada (a 1ª escolhida fica em cima).
  const [ordem, setOrdem] = useState<Secao[]>(() => {
    const o: Secao[] = [];
    if (persianaSnapTemConteudo(rascunhoLocal?.persiana)) o.push('persiana');
    if (cortinaSnapTemConteudo(rascunhoLocal?.cortina)) o.push('cortina');
    if (extrasSnapTemConteudo(rascunhoLocal?.trilhos_especiais)) o.push('trilho');
    if (extrasSnapTemConteudo(rascunhoLocal?.produtos_avulsos)) o.push('avulso');
    return o;
  });
  const incluiPersiana = ordem.includes('persiana');
  const incluiCortina = ordem.includes('cortina');
  const incluiTrilho = ordem.includes('trilho');
  const incluiAvulso = ordem.includes('avulso');
  const [rt, setRt] = useState(rascunhoLocal?.rt_pct ?? '');
  const [recuperado] = useState(!!rascunhoLocal);

  // Edição de rascunho (do banco).
  const [carregandoEdicao, setCarregandoEdicao] = useState(!!editarId);
  const [prontoEdicao, setProntoEdicao] = useState(!editarId);
  const [persianaInicial, setPersianaInicial] = useState<{ tipo: TipoPersiana; itens: ItemInput[] } | undefined>();
  const [cortinaInicial, setCortinaInicial] = useState<{ cortinas: CortinaInicial[]; instalacao_valor: number } | undefined>();
  const [focoEdicaoItem, setFocoEdicaoItem] = useState<FocoEdicaoItem>(null);

  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [enviarAberto, setEnviarAberto] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);

  // Refs para o autosave (sem re-render a cada tecla).
  const persianaSnapRef = useRef<PersianaSnapshot | null>(rascunhoLocal?.persiana ?? null);
  const cortinaSnapRef = useRef<CortinaSnapshot | null>(rascunhoLocal?.cortina ?? null);
  const trilhoSnapRef = useRef<ProdutoExtraSnap[] | null>(rascunhoLocal?.trilhos_especiais ?? null);
  const avulsoSnapRef = useRef<ProdutoExtraSnap[] | null>(rascunhoLocal?.produtos_avulsos ?? null);
  const persianaSujoRef = useRef(false);
  const cortinaSujoRef = useRef(false);
  const trilhoSujoRef = useRef(false);
  const avulsoSujoRef = useRef(false);
  const clienteRef = useRef(cliente); clienteRef.current = cliente;
  const lojaIdRef = useRef(lojaId); lojaIdRef.current = lojaId;
  const rtRef = useRef(rt); rtRef.current = rt;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agendarSalvar = useCallback(() => {
    if (editarId) return; // em edição não há autosave local
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!persianaSujoRef.current && !cortinaSujoRef.current) { limparRascunhoLocal(); return; }
      const cli = clienteRef.current;
      const r: RascunhoLocal = {
        tipo: 'misto',
        cliente: cli ? { id: cli.id, nome: cli.nome } : null,
        loja_id: usuario?.perfil === 'admin' ? lojaIdRef.current || undefined : undefined,
        persiana: persianaSnapRef.current ?? undefined,
        cortina: cortinaSnapRef.current ?? undefined,
        trilhos_especiais: trilhoSnapRef.current ?? undefined,
        produtos_avulsos: avulsoSnapRef.current ?? undefined,
        rt_pct: rtRef.current,
        ts: Date.now(),
      };
      salvarRascunhoLocal(r);
    }, 500);
  }, [editarId, usuario?.perfil]);

  const onSnapPersiana = useCallback((s: PersianaSnapshot) => { persianaSnapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const onSnapCortina = useCallback((s: CortinaSnapshot) => { cortinaSnapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const onSnapTrilho = useCallback((s: ProdutoExtraSnap[]) => { trilhoSnapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const onSnapAvulso = useCallback((s: ProdutoExtraSnap[]) => { avulsoSnapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const atualizarDirty = useCallback(() => {
    setDirty(persianaSujoRef.current || cortinaSujoRef.current || trilhoSujoRef.current || avulsoSujoRef.current);
  }, [setDirty]);
  const onDirtyPersiana = useCallback((sujo: boolean) => { persianaSujoRef.current = sujo; atualizarDirty(); agendarSalvar(); }, [agendarSalvar, atualizarDirty]);
  const onDirtyCortina = useCallback((sujo: boolean) => { cortinaSujoRef.current = sujo; atualizarDirty(); agendarSalvar(); }, [agendarSalvar, atualizarDirty]);
  const onDirtyTrilho = useCallback((sujo: boolean) => { trilhoSujoRef.current = sujo; atualizarDirty(); agendarSalvar(); }, [agendarSalvar, atualizarDirty]);
  const onDirtyAvulso = useCallback((sujo: boolean) => { avulsoSujoRef.current = sujo; atualizarDirty(); agendarSalvar(); }, [agendarSalvar, atualizarDirty]);
  const onSelecionarCliente = useCallback((c: ClienteResumo | null) => { setCliente(c); agendarSalvar(); }, [agendarSalvar]);
  const onSelecionarLoja = useCallback((id: string) => {
    lojaIdRef.current = id;
    setLojaId(id);
    agendarSalvar();
  }, [agendarSalvar]);

  // Marcar/desmarcar uma seção. Ao desmarcar, zera resultado/snapshot daquela seção
  // para que não conte no total nem volte na recuperação.
  function toggleIncluiPersiana(v: boolean) {
    setOrdem((prev) => (v ? (prev.includes('persiana') ? prev : [...prev, 'persiana']) : prev.filter((s) => s !== 'persiana')));
    if (!v) {
      setResultado(null);
      setPersianaCalculando(false);
      persianaSnapRef.current = null; persianaSujoRef.current = false;
      atualizarDirty(); agendarSalvar();
    }
  }
  function toggleIncluiCortina(v: boolean) {
    setOrdem((prev) => (v ? (prev.includes('cortina') ? prev : [...prev, 'cortina']) : prev.filter((s) => s !== 'cortina')));
    if (!v) {
      setCortinaEstado(ESTADO_CORTINA_VAZIO);
      cortinaSnapRef.current = null; cortinaSujoRef.current = false;
      atualizarDirty(); agendarSalvar();
    }
  }
  function toggleIncluiTrilho(v: boolean) {
    setOrdem((prev) => (v ? (prev.includes('trilho') ? prev : [...prev, 'trilho']) : prev.filter((s) => s !== 'trilho')));
    if (!v) {
      setTrilhoEstado(ESTADO_EXTRA_VAZIO);
      trilhoSnapRef.current = null; trilhoSujoRef.current = false;
      atualizarDirty(); agendarSalvar();
    }
  }
  function toggleIncluiAvulso(v: boolean) {
    setOrdem((prev) => (v ? (prev.includes('avulso') ? prev : [...prev, 'avulso']) : prev.filter((s) => s !== 'avulso')));
    if (!v) {
      setAvulsoEstado(ESTADO_EXTRA_VAZIO);
      avulsoSnapRef.current = null; avulsoSujoRef.current = false;
      atualizarDirty(); agendarSalvar();
    }
  }

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
          navigate(`/orcamentos/${editarId}`); return;
        }
        setCliente(o.gc_cliente_id ? { id: o.gc_cliente_id, nome: o.nome_cliente, tipo_pessoa: '', documento: null } : null);
        setLojaId(o.loja_id ?? '');
        const entrada = (o.entrada_json ?? null) as { tipo?: string; itens?: ItemInput[]; cortinas?: CortinaInicial[]; trilhos_especiais?: ProdutoExtraSnap[]; produtos_avulsos?: ProdutoExtraSnap[]; rt_pct?: number } | null;
        const ehMisto = o.tipo_produto === 'misto';
        const ehCortina = o.tipo_produto === 'cortina';
        const itemFoco = Number(itemFocoParam);
        setRt(entrada?.rt_pct ? String(entrada.rt_pct) : '');

        const novaOrdem: Secao[] = [];
        let foco: FocoEdicaoItem = null;
        if (ehMisto) {
          const qtdPersianas = entrada?.itens?.length ?? 0;
          const qtdCortinas = entrada?.cortinas?.length ?? 0;
          if (entrada?.itens?.length) { setPersianaInicial({ tipo: entrada.tipo as TipoPersiana, itens: entrada.itens }); novaOrdem.push('persiana'); }
          if (entrada?.cortinas?.length) { setCortinaInicial({ cortinas: entrada.cortinas, instalacao_valor: 0 }); novaOrdem.push('cortina'); }
          if (entrada?.trilhos_especiais?.length) { trilhoSnapRef.current = entrada.trilhos_especiais; novaOrdem.push('trilho'); }
          if (entrada?.produtos_avulsos?.length) { avulsoSnapRef.current = entrada.produtos_avulsos; novaOrdem.push('avulso'); }
          if (Number.isInteger(itemFoco) && itemFoco >= 0) {
            if (itemFoco < qtdPersianas) foco = { secao: 'persiana', index: itemFoco };
            else if (itemFoco < qtdPersianas + qtdCortinas) foco = { secao: 'cortina', index: itemFoco - qtdPersianas };
          }
        } else if (ehCortina) {
          if (entrada?.cortinas?.length) { setCortinaInicial({ cortinas: entrada.cortinas, instalacao_valor: 0 }); novaOrdem.push('cortina'); }
          else { showToast('error', 'Rascunho antigo', 'Este rascunho não tem dados para reabrir. Crie um novo orçamento.'); navigate(`/orcamentos/${editarId}`); return; }
          if (Number.isInteger(itemFoco) && itemFoco >= 0 && itemFoco < (entrada?.cortinas?.length ?? 0)) foco = { secao: 'cortina', index: itemFoco };
        } else {
          if (entrada?.itens?.length) { setPersianaInicial({ tipo: o.tipo_produto as TipoPersiana, itens: entrada.itens }); novaOrdem.push('persiana'); }
          else if (o.itens_json && o.itens_json.length > 0) {
            setPersianaInicial({
              tipo: o.tipo_produto as TipoPersiana,
              itens: o.itens_json.map((s: ItemSnapshot) => ({
                tecido_id: s.tecido_codigo_gc, cor_acessorio: s.cor_acessorio as Cor, acionamento: s.acionamento as Acionamento,
                largura: Number(s.largura_m), altura: Number(s.altura_m), tc: Number(s.tc_m), rolamento: s.rolamento, base: s.base, comando: s.comando,
                fixacao_instalacao: s.fixacao_instalacao === 'teto' || s.fixacao_instalacao === 'parede' ? s.fixacao_instalacao : null,
              })),
            });
            novaOrdem.push('persiana');
          } else { showToast('error', 'Rascunho sem itens', 'Não há itens para reabrir.'); navigate(`/orcamentos/${editarId}`); return; }
          const totalPersianas = entrada?.itens?.length ?? o.itens_json?.length ?? 0;
          if (Number.isInteger(itemFoco) && itemFoco >= 0 && itemFoco < totalPersianas) foco = { secao: 'persiana', index: itemFoco };
        }
        setOrdem(novaOrdem);
        setFocoEdicaoItem(foco);
        setProntoEdicao(true);
      } catch {
        if (vivo) { showToast('error', 'Não foi possível abrir o orçamento para edição.'); navigate('/orcamentos'); }
      } finally {
        if (vivo) setCarregandoEdicao(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId, itemFocoParam]);

  useEffect(() => {
    if (!prontoEdicao || !focoEdicaoItem) return;
    const timeout = window.setTimeout(() => {
      const alvoId = focoEdicaoItem.secao === 'cortina'
        ? `tamanho-barra-cortina-${focoEdicaoItem.index}`
        : `altura-persiana-${focoEdicaoItem.index}`;
      const fallbackId = focoEdicaoItem.secao === 'cortina'
        ? `altura-cortina-${focoEdicaoItem.index}`
        : `largura-persiana-${focoEdicaoItem.index}`;
      const alvo = document.getElementById(alvoId) as HTMLInputElement | HTMLSelectElement | null;
      const fallback = document.getElementById(fallbackId) as HTMLInputElement | HTMLSelectElement | null;
      const campo = alvo ?? fallback;
      campo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      campo?.focus();
      if (campo instanceof HTMLInputElement) campo.select();
      if (focoEdicaoItem.secao === 'cortina') {
        showToast('info', 'Cópia editável aberta', 'Ajuste o tamanho da barra deste item e salve o orçamento.');
      } else {
        showToast('info', 'Cópia editável aberta', 'Ajuste este item e salve o orçamento.');
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [prontoEdicao, focoEdicaoItem, showToast]);

  // --- Derivados ---
  const persianaItens: ItemInput[] = resultado ? resultado.itens.map((it) => it.input) : [];
  const temPersiana = persianaItens.length > 0;
  const persianaTotal = resultado ? roundHalfUp(resultado.itens.reduce((s, it) => s + (it.resultado.valor_bruto ?? 0), 0)) : 0;
  const persianaIncompleto = !!resultado?.incompleto;

  const temCortina = cortinaEstado.temCortinas;
  const cortinaTotal = cortinaEstado.total;
  const cortinaCompletas = cortinaEstado.todasCompletas;
  const temTrilho = trilhoEstado.count > 0;
  const trilhoTotal = trilhoEstado.total;
  const temAvulso = avulsoEstado.count > 0;
  const avulsoTotal = avulsoEstado.total;
  const calculandoOrcamento = persianaCalculando || cortinaEstado.calculando;

  const algoPreenchido = temPersiana || temCortina || temTrilho || temAvulso;
  // Instalação já está embutida no valor de cada item (Victor 26/06/2026).
  // RT do arquiteto (Victor 27/06/2026): gross-up por item (10% do valor final), pra
  // que a soma bata com o GestãoClick (servidor aplica o mesmo fator em cada produto).
  const rtNum = Math.max(0, Math.min(99, Number(rt) || 0));
  const fatorRtUi = rtNum > 0 ? 1 / (1 - rtNum / 100) : 1;
  const grossItem = (v: number) => roundHalfUp(v * fatorRtUi);
  const persianaTotalRt = resultado ? roundHalfUp(resultado.itens.reduce((s, it) => s + grossItem(it.resultado.valor_bruto ?? 0), 0)) : 0;
  const cortinaTotalRt = roundHalfUp((cortinaEstado.totais ?? []).reduce((s, t) => s + grossItem(t), 0));
  const trilhoTotalRt = grossItem(trilhoTotal);
  const avulsoTotalRt = grossItem(avulsoTotal);
  const totalBase = roundHalfUp(persianaTotal + cortinaTotal + trilhoTotal + avulsoTotal);
  const totalGeral = roundHalfUp(persianaTotalRt + cortinaTotalRt + trilhoTotalRt + avulsoTotalRt);
  const rtValor = roundHalfUp(totalGeral - totalBase);

  // Persiana (se houver) precisa estar completa; cortina (se houver) idem.
  const persianaOk = !temPersiana || !persianaIncompleto;
  const cortinaOk = !temCortina || cortinaCompletas;
  const trilhoOk = !incluiTrilho || trilhoEstado.completos;
  const avulsoOk = !incluiAvulso || avulsoEstado.completos;
  const adminLojaOk = usuario?.perfil !== 'admin' || !!lojaId;
  const conteudoValido = algoPreenchido && persianaOk && cortinaOk && trilhoOk && avulsoOk && adminLojaOk && !calculandoOrcamento;

  const gcOffline = gcStatus !== 'online';
  const semVendedor = !usuario?.gc_usuario_id;
  const ocupado = enviando || salvando || calculandoOrcamento;
  const podeSalvar = conteudoValido && !ocupado;
  const podeEnviar = conteudoValido && !gcOffline && !!cliente && !ocupado;

  function aoEnviado(orc: { status: string }) {
    if (orc.status === 'enviado' || orc.status === 'rascunho') {
      limparRascunhoLocal();
      persianaSujoRef.current = false; cortinaSujoRef.current = false; setDirty(false);
      navigate('/orcamentos');
    }
  }

  async function doSubmit(apenasSalvar: boolean): Promise<void> {
    if (apenasSalvar ? !podeSalvar : !podeEnviar) return;
    if (apenasSalvar) setSalvando(true); else setEnviando(true);
    try {
      const comum = {
        rt_pct: rtNum,
        ...(usuario?.perfil === 'admin' ? { loja_id: lojaId || undefined } : {}),
        ...(cliente ? { gc_cliente_id: cliente.id, nome_cliente: cliente.nome } : {}),
        ...(apenasSalvar ? { apenas_salvar: true } : {}),
        ...(editarId ? { editar_id: editarId } : {}),
      };
      let endpoint: string;
      let body: Record<string, unknown>;
      if (temPersiana && temCortina && !temTrilho && !temAvulso) {
        endpoint = '/orcamentos/misto';
        body = { tipo: resultado!.tipo, itens: persianaItens, cortinas: cortinaEstado.cortinas, ...comum };
      } else if (temPersiana && !temCortina && !temTrilho && !temAvulso) {
        endpoint = '/orcamentos';
        body = { tipo: resultado!.tipo, itens: persianaItens, ...comum };
      } else if (temCortina && !temPersiana && !temTrilho && !temAvulso) {
        endpoint = '/orcamentos/cortina';
        body = { cortinas: cortinaEstado.cortinas, ...comum };
      } else {
        endpoint = '/orcamentos/misto';
        body = {
          tipo: resultado?.tipo,
          itens: persianaItens,
          cortinas: cortinaEstado.cortinas,
          trilhos_especiais: trilhoEstado.itens,
          produtos_avulsos: avulsoEstado.itens,
          ...comum,
        };
      }
      const r = await api.post<{ orcamento: OrcamentoSalvo }>(endpoint, body);
      showToast('success', apenasSalvar ? 'Orçamento salvo (rascunho)' : `Orçamento #${r.orcamento.gc_orcamento_id} criado no GestãoClick`, cliente?.nome);
      aoEnviado(r.orcamento);
    } catch (e) {
      const erro = e instanceof ApiError ? (e.data as { erro?: { codigo?: string; message?: string } } | null)?.erro : null;
      if (erro?.codigo === 'GC_AUTH') showToast('error', 'Credenciais GestãoClick inválidas', 'Contate o administrador.');
      else showToast('error', apenasSalvar ? 'Erro ao salvar' : 'Erro ao enviar ao GestãoClick', erro?.message ?? (e instanceof ApiError ? e.message : 'Falha inesperada.'));
      const orc = e instanceof ApiError ? (e.data as { orcamento?: OrcamentoSalvo } | null)?.orcamento : null;
      if (orc) aoEnviado(orc);
    } finally {
      if (apenasSalvar) setSalvando(false); else setEnviando(false);
    }
  }

  function descartarRecuperado() {
    limparRascunhoLocal();
    persianaSnapRef.current = null; cortinaSnapRef.current = null;
    trilhoSnapRef.current = null; avulsoSnapRef.current = null;
    persianaSujoRef.current = false; cortinaSujoRef.current = false; trilhoSujoRef.current = false; avulsoSujoRef.current = false; setDirty(false);
    window.location.assign('/orcamentos/novo');
  }

  // Cancelar (intencional): descarta o que está sendo preenchido e sai. Em edição,
  // volta para o detalhe (o rascunho salvo permanece intacto).
  function doCancelar() {
    limparRascunhoLocal();
    persianaSnapRef.current = null; cortinaSnapRef.current = null;
    trilhoSnapRef.current = null; avulsoSnapRef.current = null;
    persianaSujoRef.current = false; cortinaSujoRef.current = false; trilhoSujoRef.current = false; avulsoSujoRef.current = false; setDirty(false);
    navigate(editarId ? `/orcamentos/${editarId}` : '/orcamentos');
  }

  useEffect(() => () => { setDirty(false); if (timerRef.current) clearTimeout(timerRef.current); }, [setDirty]);

  if (editarId && carregandoEdicao) {
    return <div className="text-neutral-500"><FontAwesomeIcon icon={faSpinner} spin /> Carregando orçamento…</div>;
  }

  return (
    <div>
      <h1 className="text-2xl-ui font-bold text-neutral-800 mb-4">{editarId ? 'Editar Orçamento' : 'Novo Orçamento'}</h1>

      {editarId && (
        <div className="alert alert-info mb-4 flex items-center justify-between gap-3">
          <span>Editando um rascunho. Altere o que precisar e use <strong>Salvar</strong> ou <strong>Enviar</strong> — o mesmo orçamento será atualizado.</span>
          <button className="btn btn-default btn-xs" onClick={() => navigate(`/orcamentos/${editarId}`)}>
            <FontAwesomeIcon icon={faXmark} /> Cancelar edição
          </button>
        </div>
      )}

      {!editarId && recuperado && (
        <div className="alert alert-warning mb-4 flex items-center justify-between gap-3">
          <span>Recuperamos um orçamento que você não chegou a salvar. Continue de onde parou ou descarte para começar do zero.</span>
          <button className="btn btn-default btn-xs" onClick={descartarRecuperado}>
            <FontAwesomeIcon icon={faRotateLeft} /> Descartar e começar novo
          </button>
        </div>
      )}

      {usuario && !usuario.gc_usuario_id && (
        <div className="alert alert-warning max-w-form mb-4">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <div>
            <div className="font-semibold">Usuário sem vendedor vinculado</div>
            <div className="text-xs-ui opacity-85">Você pode enviar normalmente, mas o orçamento sairá sem vendedor no GestãoClick. Um admin pode vincular em Administração → Usuários.</div>
          </div>
        </div>
      )}

      {/* Cliente e loja — no topo (padrão GestãoClick). Cliente é obrigatório só para enviar ao GC. */}
      <div className="card p-4 mb-4">
        <div className={usuario?.perfil === 'admin' ? 'grid grid-cols-1 lg:grid-cols-3 gap-4' : ''}>
          <div className={usuario?.perfil === 'admin' ? 'lg:col-span-2' : ''}>
            <label className="form-label">Cliente <span className="label-optional">(obrigatório para enviar ao GestãoClick)</span></label>
            <ClienteSearch selecionado={cliente} onSelecionar={onSelecionarCliente} />
          </div>
          {usuario?.perfil === 'admin' && (
            <div>
              <label className="form-label" htmlFor="loja-orcamento">Loja / Filial</label>
              <select id="loja-orcamento" className="input" value={lojaId} onChange={(e) => onSelecionarLoja(e.target.value)}>
                <option value="">Selecione a loja</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>{loja.nome}</option>
                ))}
              </select>
              <div className="helper-text">Define onde o orçamento será salvo e enviado.</div>
            </div>
          )}
        </div>
      </div>

      {/* Seletor: o vendedor decide o que entra no orçamento. */}
      <div className="card p-4 mb-4">
        <div className="form-label mb-2">O que incluir neste orçamento?</div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-md-ui cursor-pointer">
            <input type="checkbox" checked={incluiPersiana} onChange={(e) => toggleIncluiPersiana(e.target.checked)} style={{ accentColor: 'var(--action-add)' }} />
            <FontAwesomeIcon icon={faScroll} className="text-neutral-500" /> Persianas
          </label>
          <label className="flex items-center gap-2 text-md-ui cursor-pointer">
            <input type="checkbox" checked={incluiCortina} onChange={(e) => toggleIncluiCortina(e.target.checked)} style={{ accentColor: 'var(--action-add)' }} />
            <FontAwesomeIcon icon={faLayerGroup} className="text-neutral-500" /> Cortinas
          </label>
          <label className="flex items-center gap-2 text-md-ui cursor-pointer">
            <input type="checkbox" checked={incluiTrilho} onChange={(e) => toggleIncluiTrilho(e.target.checked)} style={{ accentColor: 'var(--action-add)' }} />
            <FontAwesomeIcon icon={faGripLines} className="text-neutral-500" /> Trilhos especiais
          </label>
          <label className="flex items-center gap-2 text-md-ui cursor-pointer">
            <input type="checkbox" checked={incluiAvulso} onChange={(e) => toggleIncluiAvulso(e.target.checked)} style={{ accentColor: 'var(--action-add)' }} />
            <FontAwesomeIcon icon={faBoxOpen} className="text-neutral-500" /> Produtos avulsos
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-6">
          {ordem.length === 0 && (
            <div className="card p-6 text-center text-neutral-500 text-sm-ui">
              Marque acima o que deseja incluir no orçamento.
            </div>
          )}

          {/* Seções renderizadas na ORDEM em que o vendedor as selecionou. */}
          {ordem.map((s) => {
            if (s === 'persiana') return (
              <section key="persiana">
                <h2 className="text-lg-ui font-semibold text-neutral-800 mb-2 flex items-center gap-2"><FontAwesomeIcon icon={faScroll} className="text-neutral-500" /> Persianas</h2>
                {prontoEdicao && (
                  <PersianaForm onResult={setResultado} inicial={persianaInicial} restauro={rascunhoLocal?.persiana} onDirtyChange={onDirtyPersiana} onSnapshot={onSnapPersiana} onCalculandoChange={setPersianaCalculando} />
                )}
              </section>
            );
            if (s === 'cortina') return (
              <section key="cortina">
                <h2 className="text-lg-ui font-semibold text-neutral-800 mb-2 flex items-center gap-2"><FontAwesomeIcon icon={faLayerGroup} className="text-neutral-500" /> Cortinas</h2>
                {prontoEdicao && (
                  <CortinaOrcamento
                    embutido
                    cliente={cliente}
                    gcStatus={gcStatus}
                    gcUsuarioId={usuario?.gc_usuario_id ?? null}
                    inicial={cortinaInicial}
                    restauro={rascunhoLocal?.cortina}
                    editarId={editarId}
                    onDirtyChange={onDirtyCortina}
                    onSnapshot={onSnapCortina}
                    onEnviado={() => {}}
                    onEstado={setCortinaEstado}
                  />
                )}
              </section>
            );
            if (s === 'trilho') return (
              <section key="trilho">
                <h2 className="text-lg-ui font-semibold text-neutral-800 mb-2 flex items-center gap-2"><FontAwesomeIcon icon={faGripLines} className="text-neutral-500" /> Trilhos especiais</h2>
                {prontoEdicao && (
                  <ItensExtrasOrcamento titulo="Trilhos especiais" modo="trilho" inicial={rascunhoLocal?.trilhos_especiais ?? trilhoSnapRef.current ?? undefined} onEstado={setTrilhoEstado} onSnapshot={onSnapTrilho} onDirtyChange={onDirtyTrilho} />
                )}
              </section>
            );
            return (
              <section key="avulso">
                <h2 className="text-lg-ui font-semibold text-neutral-800 mb-2 flex items-center gap-2"><FontAwesomeIcon icon={faBoxOpen} className="text-neutral-500" /> Produtos avulsos</h2>
                {prontoEdicao && (
                  <ItensExtrasOrcamento titulo="Produtos avulsos" modo="avulso" inicial={rascunhoLocal?.produtos_avulsos ?? avulsoSnapRef.current ?? undefined} onEstado={setAvulsoEstado} onSnapshot={onSnapAvulso} onDirtyChange={onDirtyAvulso} />
                )}
              </section>
            );
          })}
        </div>

        {/* Painel unificado */}
        <div className="lg:col-span-1">
          <div className="card sticky p-4" style={{ top: 'calc(50px + 16px)' }}>
            <h4 className="text-lg-ui font-medium mb-3">Orçamento</h4>

            <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3 space-y-1">
              <div className="flex justify-between text-xs-ui">
                <span className="text-neutral-600">Persianas {temPersiana ? `(${persianaItens.length})` : ''}{temPersiana && persianaIncompleto ? <span className="text-warning"> (incompleto)</span> : null}</span>
                <span className="font-mono tabular-nums text-neutral-800">
                  {persianaCalculando ? <><FontAwesomeIcon icon={faSpinner} spin /> Calculando...</> : formatBRL(persianaTotal)}
                </span>
              </div>
              <div className="flex justify-between text-xs-ui">
                <span className="text-neutral-600">Cortinas {temCortina ? `(${cortinaEstado.count})` : ''}{temCortina && !cortinaCompletas ? <span className="text-warning"> (acessório a definir)</span> : null}</span>
                <span className="font-mono tabular-nums text-neutral-800">
                  {cortinaEstado.calculando ? <><FontAwesomeIcon icon={faSpinner} spin /> Calculando...</> : formatBRL(cortinaTotal)}
                </span>
              </div>
              <div className="flex justify-between text-xs-ui">
                <span className="text-neutral-600">Trilhos especiais {temTrilho ? `(${trilhoEstado.count})` : ''}{incluiTrilho && !trilhoEstado.completos ? <span className="text-warning"> (incompleto)</span> : null}</span>
                <span className="font-mono tabular-nums text-neutral-800">{formatBRL(trilhoTotal)}</span>
              </div>
              <div className="flex justify-between text-xs-ui">
                <span className="text-neutral-600">Produtos avulsos {temAvulso ? `(${avulsoEstado.count})` : ''}{incluiAvulso && !avulsoEstado.completos ? <span className="text-warning"> (incompleto)</span> : null}</span>
                <span className="font-mono tabular-nums text-neutral-800">{formatBRL(avulsoTotal)}</span>
              </div>
            </div>

            <div className="helper-text mb-2">A instalação é escolhida em cada item e já entra no valor.</div>

            <label className="form-label" htmlFor="rt-misto">RT do arquiteto (%)</label>
            <input id="rt-misto" type="number" className="input" min={0} max={99} step={1} placeholder="0"
              value={rt} onChange={(e) => {
                // Clampa o próprio campo em 0–99 (limite atual): digitar acima de 99 exibe 99.
                let v = e.target.value;
                const n = Number(v);
                if (v !== '' && Number.isFinite(n)) {
                  if (n > 99) v = '99';
                  else if (n < 0) v = '0';
                }
                setRt(v); agendarSalvar();
              }} />
            {rtNum > 0 && algoPreenchido && (
              <div className="helper-text mb-3">RT ({rtNum}%): <strong>{formatBRL(rtValor)}</strong> embutido no total</div>
            )}
            {!(rtNum > 0 && algoPreenchido) && <div className="mb-3" />}

            <label className="form-label" htmlFor="total-misto">Valor total</label>
            <input id="total-misto" className="input input-mono mb-4" style={{ color: 'var(--color-success)', fontSize: 20 }}
              value={calculandoOrcamento ? 'Calculando...' : formatBRL(totalGeral)} readOnly tabIndex={-1} onClick={(e) => e.currentTarget.select()} />

            {!algoPreenchido && <div className="alert alert-info mb-3 text-xs-ui"><span>Adicione ao menos uma <strong>persiana</strong> ou <strong>cortina</strong>.</span></div>}
            {algoPreenchido && usuario?.perfil === 'admin' && !lojaId && <div className="alert alert-info mb-3 text-xs-ui"><span>Selecione a <strong>Loja / Filial</strong> no topo.</span></div>}
            {temPersiana && persianaIncompleto && <div className="alert alert-warning mb-3 text-xs-ui"><span>Há <strong>persiana</strong> com campos obrigatórios em branco.</span></div>}
            {temCortina && !cortinaCompletas && <div className="alert alert-warning mb-3 text-xs-ui"><span>Escolha o <strong>produto de cada acessório</strong> em todas as cortinas.</span></div>}
            {incluiTrilho && !trilhoEstado.completos && <div className="alert alert-warning mb-3 text-xs-ui"><span>Complete produto, largura e quantidade dos <strong>trilhos especiais</strong>.</span></div>}
            {incluiAvulso && !avulsoEstado.completos && <div className="alert alert-warning mb-3 text-xs-ui"><span>Complete produto e quantidade dos <strong>produtos avulsos</strong>.</span></div>}
            {calculandoOrcamento && <div className="alert alert-info mb-3 text-xs-ui"><span>Aguarde o cálculo terminar para salvar ou enviar.</span></div>}
            {algoPreenchido && conteudoValido && !cliente && <div className="alert alert-info mb-3 text-xs-ui"><span>Selecione o <strong>cliente</strong> no topo para enviar (ou use <strong>Salvar</strong>).</span></div>}
            {algoPreenchido && gcOffline && <div className="alert alert-warning mb-3 text-xs-ui"><span>GestãoClick indisponível. Você ainda pode <strong>Salvar</strong>.</span></div>}
            {algoPreenchido && !gcOffline && semVendedor && <div className="alert alert-warning mb-3 text-xs-ui"><span>Seu usuário não está vinculado a um vendedor do GestãoClick — o orçamento sairá sem vendedor.</span></div>}

            <div className="flex gap-2">
              <button type="button" className="btn btn-default flex-1" disabled={!podeSalvar} aria-disabled={!podeSalvar} onClick={() => setSalvarAberto(true)} title="Salva sem enviar ao GestãoClick">
                {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar</>}
              </button>
              <button type="button" className="btn btn-danger flex-1" disabled={ocupado} aria-disabled={ocupado} onClick={() => { if (algoPreenchido) setCancelarAberto(true); else doCancelar(); }} title="Descarta o que está preenchido e sai">
                <FontAwesomeIcon icon={faXmark} /> Cancelar
              </button>
              <button type="button" className="btn btn-success flex-1" disabled={!podeEnviar} aria-disabled={!podeEnviar} onClick={() => { if (podeEnviar) setEnviarAberto(true); }}>
                {enviando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faPaperPlane} /> Enviar</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        aberto={salvarAberto}
        titulo="Salvar orçamento"
        mensagem="Deseja salvar este orçamento como rascunho na Pérsia? Ele não será enviado ao GestãoClick agora."
        confirmarLabel="Salvar"
        cancelarLabel="Voltar"
        onConfirmar={() => { setSalvarAberto(false); void doSubmit(true); }}
        onCancelar={() => setSalvarAberto(false)}
      />
      <ConfirmModal
        aberto={enviarAberto}
        titulo="Enviar ao GestãoClick"
        mensagem={<>Deseja enviar este orçamento de <strong>{formatBRL(totalGeral)}</strong> para o GestãoClick{cliente ? <> (cliente <strong>{cliente.nome}</strong>)</> : null}?</>}
        confirmarLabel="Enviar"
        cancelarLabel="Voltar"
        onConfirmar={() => { setEnviarAberto(false); void doSubmit(false); }}
        onCancelar={() => setEnviarAberto(false)}
      />
      <ConfirmModal
        aberto={cancelarAberto}
        titulo="Cancelar orçamento"
        mensagem="Deseja cancelar este orçamento? As informações preenchidas serão descartadas e você voltará para a lista."
        confirmarLabel="Sim, cancelar"
        cancelarLabel="Voltar"
        perigo
        onConfirmar={() => { setCancelarAberto(false); doCancelar(); }}
        onCancelar={() => setCancelarAberto(false)}
      />
    </div>
  );
}
