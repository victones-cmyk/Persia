// apps/web/src/pages/OrcamentoNovo.tsx
// Novo orçamento — TELA ÚNICA (Victor v.3.1): persianas E cortinas no mesmo orçamento.
// O envio decide a rota: só persiana → /orcamentos; só cortina → /orcamentos/cortina;
// os dois → /orcamentos/misto (1 orçamento no GestãoClick com tudo). Instalação por peça.
// - EDIÇÃO de rascunho (?editar=<id>): reabre pré-preenchido (persiana e/ou cortina).
// - AUTOSAVE LOCAL: guarda as duas seções; recupera ao voltar (lib/rascunhoLocal).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faSpinner, faXmark, faRotateLeft, faPaperPlane, faFloppyDisk, faScroll, faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { useGcHealth } from '../hooks/useGcHealth';
import { useToast } from '../hooks/useToast';
import { useNavGuard } from '../hooks/useNavGuard';
import { api, ApiError } from '../lib/api';
import { PersianaForm } from '../components/PersianaForm';
import { CortinaOrcamento, type CortinaOrcamentoEstado } from '../components/CortinaOrcamento';
import { ClienteSearch } from '../components/ClienteSearch';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatBRL, roundHalfUp } from '../lib/formatacao';
import type { CortinaInicial } from '../components/CortinaCard';
import type { OrcamentoCalculado, ClienteResumo, ItemInput, TipoPersiana, Cor, Acionamento, OrcamentoSalvo } from '../lib/calcTypes';
import type { OrcamentoDetalhe, ItemSnapshot } from '../lib/orcamentoTypes';
import {
  lerRascunhoLocal, salvarRascunhoLocal, limparRascunhoLocal,
  type PersianaSnapshot, type CortinaSnapshot, type RascunhoLocal,
} from '../lib/rascunhoLocal';

const ESTADO_CORTINA_VAZIO: CortinaOrcamentoEstado = { total: 0, todasCompletas: false, temCortinas: false, count: 0, cortinas: [] };

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

export function OrcamentoNovo() {
  const { usuario } = useAuth();
  const { status: gcStatus } = useGcHealth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setDirty } = useNavGuard();
  const [params] = useSearchParams();
  const editarId = params.get('editar');

  // Rascunho local recuperado (só fora do modo edição).
  const [rascunhoLocal] = useState<RascunhoLocal | null>(() => (editarId ? null : lerRascunhoLocal()));

  const [cliente, setCliente] = useState<ClienteResumo | null>(
    rascunhoLocal?.cliente ? { id: rascunhoLocal.cliente.id, nome: rascunhoLocal.cliente.nome, tipo_pessoa: '', documento: null } : null,
  );
  const [resultado, setResultado] = useState<OrcamentoCalculado | null>(null); // persiana
  const [cortinaEstado, setCortinaEstado] = useState<CortinaOrcamentoEstado>(ESTADO_CORTINA_VAZIO);
  // O vendedor escolhe o que incluir; cada seção só aparece quando marcada.
  const [incluiPersiana, setIncluiPersiana] = useState(() => persianaSnapTemConteudo(rascunhoLocal?.persiana));
  const [incluiCortina, setIncluiCortina] = useState(() => cortinaSnapTemConteudo(rascunhoLocal?.cortina));
  const [instalacao, setInstalacao] = useState(rascunhoLocal?.instalacao_valor ?? '');
  const [recuperado] = useState(!!rascunhoLocal);

  // Edição de rascunho (do banco).
  const [carregandoEdicao, setCarregandoEdicao] = useState(!!editarId);
  const [prontoEdicao, setProntoEdicao] = useState(!editarId);
  const [persianaInicial, setPersianaInicial] = useState<{ tipo: TipoPersiana; itens: ItemInput[] } | undefined>();
  const [cortinaInicial, setCortinaInicial] = useState<{ cortinas: CortinaInicial[]; instalacao_valor: number } | undefined>();

  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [enviarAberto, setEnviarAberto] = useState(false);

  // Refs para o autosave (sem re-render a cada tecla).
  const persianaSnapRef = useRef<PersianaSnapshot | null>(rascunhoLocal?.persiana ?? null);
  const cortinaSnapRef = useRef<CortinaSnapshot | null>(rascunhoLocal?.cortina ?? null);
  const persianaSujoRef = useRef(false);
  const cortinaSujoRef = useRef(false);
  const clienteRef = useRef(cliente); clienteRef.current = cliente;
  const instalacaoRef = useRef(instalacao); instalacaoRef.current = instalacao;
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
        persiana: persianaSnapRef.current ?? undefined,
        cortina: cortinaSnapRef.current ?? undefined,
        instalacao_valor: instalacaoRef.current,
        ts: Date.now(),
      };
      salvarRascunhoLocal(r);
    }, 500);
  }, [editarId]);

  const onSnapPersiana = useCallback((s: PersianaSnapshot) => { persianaSnapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const onSnapCortina = useCallback((s: CortinaSnapshot) => { cortinaSnapRef.current = s; agendarSalvar(); }, [agendarSalvar]);
  const onDirtyPersiana = useCallback((sujo: boolean) => { persianaSujoRef.current = sujo; setDirty(sujo || cortinaSujoRef.current); agendarSalvar(); }, [agendarSalvar, setDirty]);
  const onDirtyCortina = useCallback((sujo: boolean) => { cortinaSujoRef.current = sujo; setDirty(sujo || persianaSujoRef.current); agendarSalvar(); }, [agendarSalvar, setDirty]);
  const onSelecionarCliente = useCallback((c: ClienteResumo | null) => { setCliente(c); agendarSalvar(); }, [agendarSalvar]);

  // Marcar/desmarcar uma seção. Ao desmarcar, zera resultado/snapshot daquela seção
  // para que não conte no total nem volte na recuperação.
  function toggleIncluiPersiana(v: boolean) {
    setIncluiPersiana(v);
    if (!v) {
      setResultado(null);
      persianaSnapRef.current = null; persianaSujoRef.current = false;
      setDirty(cortinaSujoRef.current); agendarSalvar();
    }
  }
  function toggleIncluiCortina(v: boolean) {
    setIncluiCortina(v);
    if (!v) {
      setCortinaEstado(ESTADO_CORTINA_VAZIO);
      cortinaSnapRef.current = null; cortinaSujoRef.current = false;
      setDirty(persianaSujoRef.current); agendarSalvar();
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
        const entrada = (o.entrada_json ?? null) as { tipo?: string; itens?: ItemInput[]; cortinas?: CortinaInicial[]; instalacao_valor?: number } | null;
        const ehMisto = o.tipo_produto === 'misto';
        const ehCortina = o.tipo_produto === 'cortina';
        setInstalacao(entrada?.instalacao_valor ? String(entrada.instalacao_valor) : '');

        if (ehMisto) {
          if (entrada?.itens?.length) { setPersianaInicial({ tipo: entrada.tipo as TipoPersiana, itens: entrada.itens }); setIncluiPersiana(true); }
          if (entrada?.cortinas?.length) { setCortinaInicial({ cortinas: entrada.cortinas, instalacao_valor: 0 }); setIncluiCortina(true); }
        } else if (ehCortina) {
          if (entrada?.cortinas?.length) { setCortinaInicial({ cortinas: entrada.cortinas, instalacao_valor: 0 }); setIncluiCortina(true); }
          else { showToast('error', 'Rascunho antigo', 'Este rascunho não tem dados para reabrir. Crie um novo orçamento.'); navigate(`/orcamentos/${editarId}`); return; }
        } else {
          if (entrada?.itens?.length) { setPersianaInicial({ tipo: o.tipo_produto as TipoPersiana, itens: entrada.itens }); setIncluiPersiana(true); }
          else if (o.itens_json && o.itens_json.length > 0) {
            setPersianaInicial({
              tipo: o.tipo_produto as TipoPersiana,
              itens: o.itens_json.map((s: ItemSnapshot) => ({
                tecido_id: s.tecido_codigo_gc, cor_acessorio: s.cor_acessorio as Cor, acionamento: s.acionamento as Acionamento,
                largura: Number(s.largura_m), altura: Number(s.altura_m), tc: Number(s.tc_m), rolamento: s.rolamento, base: s.base,
              })),
            });
            setIncluiPersiana(true);
          } else { showToast('error', 'Rascunho sem itens', 'Não há itens para reabrir.'); navigate(`/orcamentos/${editarId}`); return; }
        }
        setProntoEdicao(true);
      } catch {
        if (vivo) { showToast('error', 'Não foi possível abrir o orçamento para edição.'); navigate('/orcamentos'); }
      } finally {
        if (vivo) setCarregandoEdicao(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId]);

  // --- Derivados ---
  const persianaItens: ItemInput[] = resultado ? resultado.itens.map((it) => it.input) : [];
  const temPersiana = persianaItens.length > 0;
  const persianaTotal = resultado ? roundHalfUp(resultado.itens.reduce((s, it) => s + (it.resultado.valor_bruto ?? 0), 0)) : 0;
  const persianaIncompleto = !!resultado?.incompleto;

  const temCortina = cortinaEstado.temCortinas;
  const cortinaTotal = cortinaEstado.total;
  const cortinaCompletas = cortinaEstado.todasCompletas;

  const algoPreenchido = temPersiana || temCortina;
  const pecas = persianaItens.length + cortinaEstado.count;
  const instalacaoPorPeca = Math.max(0, Number(instalacao) || 0);
  const valorInstalacao = roundHalfUp(instalacaoPorPeca * pecas);
  const totalGeral = roundHalfUp(persianaTotal + cortinaTotal + valorInstalacao);

  // Persiana (se houver) precisa estar completa; cortina (se houver) idem.
  const persianaOk = !temPersiana || !persianaIncompleto;
  const cortinaOk = !temCortina || cortinaCompletas;
  const conteudoValido = algoPreenchido && persianaOk && cortinaOk;

  const gcOffline = gcStatus !== 'online';
  const semVendedor = !usuario?.gc_usuario_id;
  const ocupado = enviando || salvando;
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
        instalacao_valor: instalacaoPorPeca,
        ...(cliente ? { gc_cliente_id: cliente.id, nome_cliente: cliente.nome } : {}),
        ...(apenasSalvar ? { apenas_salvar: true } : {}),
        ...(editarId ? { editar_id: editarId } : {}),
      };
      let endpoint: string;
      let body: Record<string, unknown>;
      if (temPersiana && temCortina) {
        endpoint = '/orcamentos/misto';
        body = { tipo: resultado!.tipo, itens: persianaItens, cortinas: cortinaEstado.cortinas, ...comum };
      } else if (temPersiana) {
        endpoint = '/orcamentos';
        body = { tipo: resultado!.tipo, itens: persianaItens, ...comum };
      } else {
        endpoint = '/orcamentos/cortina';
        body = { cortinas: cortinaEstado.cortinas, ...comum };
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
    persianaSujoRef.current = false; cortinaSujoRef.current = false; setDirty(false);
    window.location.assign('/orcamentos/novo');
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

      {/* Cliente — no topo (padrão GestãoClick). Obrigatório só para enviar ao GC. */}
      <div className="card p-4 mb-4">
        <label className="form-label">Cliente <span className="label-optional">(obrigatório para enviar ao GestãoClick)</span></label>
        <ClienteSearch selecionado={cliente} onSelecionar={onSelecionarCliente} />
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-6">
          {!incluiPersiana && !incluiCortina && (
            <div className="card p-6 text-center text-neutral-500 text-sm-ui">
              Marque acima o que deseja incluir: <strong>Persianas</strong>, <strong>Cortinas</strong> ou os dois.
            </div>
          )}

          {/* Seção PERSIANAS */}
          {incluiPersiana && (
            <section>
              <h2 className="text-lg-ui font-semibold text-neutral-800 mb-2 flex items-center gap-2"><FontAwesomeIcon icon={faScroll} className="text-neutral-500" /> Persianas</h2>
              {prontoEdicao && (
                <PersianaForm onResult={setResultado} inicial={persianaInicial} restauro={rascunhoLocal?.persiana} onDirtyChange={onDirtyPersiana} onSnapshot={onSnapPersiana} />
              )}
            </section>
          )}

          {/* Seção CORTINAS */}
          {incluiCortina && (
            <section>
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
          )}
        </div>

        {/* Painel unificado */}
        <div className="lg:col-span-1">
          <div className="card sticky p-4" style={{ top: 'calc(50px + 16px)' }}>
            <h4 className="text-lg-ui font-medium mb-3">Orçamento</h4>

            <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 mb-3 space-y-1">
              <div className="flex justify-between text-xs-ui">
                <span className="text-neutral-600">Persianas {temPersiana ? `(${persianaItens.length})` : ''}{temPersiana && persianaIncompleto ? <span className="text-warning"> (incompleto)</span> : null}</span>
                <span className="font-mono tabular-nums text-neutral-800">{formatBRL(persianaTotal)}</span>
              </div>
              <div className="flex justify-between text-xs-ui">
                <span className="text-neutral-600">Cortinas {temCortina ? `(${cortinaEstado.count})` : ''}{temCortina && !cortinaCompletas ? <span className="text-warning"> (acessório a definir)</span> : null}</span>
                <span className="font-mono tabular-nums text-neutral-800">{formatBRL(cortinaTotal)}</span>
              </div>
            </div>

            <label className="form-label" htmlFor="instalacao-misto">Instalação por peça (R$)</label>
            <input id="instalacao-misto" type="number" className="input" min={0} step={0.01} placeholder="0,00"
              value={instalacao} onChange={(e) => { setInstalacao(e.target.value); agendarSalvar(); }} />
            {instalacaoPorPeca > 0 && pecas > 0 && (
              <div className="helper-text mb-3">{formatBRL(instalacaoPorPeca)} × {pecas} {pecas === 1 ? 'peça' : 'peças'} = <strong>{formatBRL(valorInstalacao)}</strong></div>
            )}
            {!(instalacaoPorPeca > 0 && pecas > 0) && <div className="mb-3" />}

            <label className="form-label" htmlFor="total-misto">Valor total</label>
            <input id="total-misto" className="input input-mono mb-4" style={{ color: 'var(--color-success)', fontSize: 20 }}
              value={formatBRL(totalGeral)} readOnly tabIndex={-1} onClick={(e) => e.currentTarget.select()} />

            {!algoPreenchido && <div className="alert alert-info mb-3 text-xs-ui"><span>Adicione ao menos uma <strong>persiana</strong> ou <strong>cortina</strong>.</span></div>}
            {temPersiana && persianaIncompleto && <div className="alert alert-warning mb-3 text-xs-ui"><span>Há <strong>persiana</strong> com campos obrigatórios em branco.</span></div>}
            {temCortina && !cortinaCompletas && <div className="alert alert-warning mb-3 text-xs-ui"><span>Escolha o <strong>produto de cada acessório</strong> em todas as cortinas.</span></div>}
            {algoPreenchido && conteudoValido && !cliente && <div className="alert alert-info mb-3 text-xs-ui"><span>Selecione o <strong>cliente</strong> no topo para enviar (ou use <strong>Salvar</strong>).</span></div>}
            {algoPreenchido && gcOffline && <div className="alert alert-warning mb-3 text-xs-ui"><span>GestãoClick indisponível. Você ainda pode <strong>Salvar</strong>.</span></div>}
            {algoPreenchido && !gcOffline && semVendedor && <div className="alert alert-warning mb-3 text-xs-ui"><span>Seu usuário não está vinculado a um vendedor do GestãoClick — o orçamento sairá sem vendedor.</span></div>}

            <div className="flex gap-2">
              <button type="button" className="btn btn-default flex-1" disabled={!podeSalvar} aria-disabled={!podeSalvar} onClick={() => setSalvarAberto(true)} title="Salva sem enviar ao GestãoClick">
                {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faFloppyDisk} /> Salvar</>}
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
    </div>
  );
}
