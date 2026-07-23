import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPlus, faSpinner, faTrash } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { getCacheado } from '../lib/dadosCache';
import { formatBRL, formatNum } from '../lib/formatacao';
import type { CalculadoraTrilhoEspecial } from '../lib/calcTypes';
import type { ProdutoExtraSnap } from '../lib/rascunhoLocal';
import type { ItemExtraPayload, ItensExtrasEstado } from './ItensExtrasOrcamento';

interface LinhaState {
  id: string;
  calculadora_id: string;
  variante_id: string;
  ambiente: string;
  largura: string;
  quantidade: string;
  emendas: string;
  lado_motor: 'direito' | 'esquerdo';
  tipo_abertura: 'direita' | 'esquerda';
  observacao: string;
}

interface ComponenteCalculado {
  produto_id: string;
  codigo_interno: string;
  nome: string;
  formula: string;
  quantidade: number;
  preco_venda: number;
  subtotal: number;
}

interface ResultadoTrilho {
  calculadora_id: string;
  variante_id: string;
  variante_nome: string;
  nome: string;
  largura: number;
  quantidade: number;
  emendas: number;
  componentes: ComponenteCalculado[];
  valor_unitario: number;
  valor_total: number;
}

const vazia = (): LinhaState => ({
  id: crypto.randomUUID(),
  calculadora_id: '',
  variante_id: '',
  ambiente: '',
  largura: '',
  quantidade: '1',
  emendas: '0',
  lado_motor: 'direito',
  tipo_abertura: 'direita',
  observacao: '',
});

function normalizarInicial(inicial?: ProdutoExtraSnap[]): LinhaState[] {
  if (!inicial?.length) return [vazia()];
  return inicial.map((item) => ({
    id: crypto.randomUUID(),
    calculadora_id: item.calculadora_id ?? '',
    variante_id: item.variante_id ?? '',
    ambiente: item.ambiente ?? '',
    largura: item.largura ?? '',
    quantidade: item.quantidade ?? '1',
    emendas: item.emendas ?? '0',
    lado_motor: item.lado_motor === 'esquerdo' ? 'esquerdo' : 'direito',
    tipo_abertura: item.tipo_abertura === 'esquerda' ? 'esquerda' : 'direita',
    observacao: item.observacao ?? '',
  }));
}

function resultadoCorresponde(linha: LinhaState, resultado?: ResultadoTrilho): resultado is ResultadoTrilho {
  return !!resultado
    && resultado.calculadora_id === linha.calculadora_id
    && resultado.variante_id === linha.variante_id
    && resultado.largura === Number(linha.largura)
    && resultado.quantidade === Number(linha.quantidade)
    && resultado.emendas === Number(linha.emendas);
}

export function TrilhosEspeciaisOrcamento({
  inicial,
  onEstado,
  onSnapshot,
  onDirtyChange,
}: {
  inicial?: ProdutoExtraSnap[];
  onEstado: (estado: ItensExtrasEstado) => void;
  onSnapshot?: (snap: ProdutoExtraSnap[]) => void;
  onDirtyChange?: (sujo: boolean) => void;
}) {
  const [calculadoras, setCalculadoras] = useState<CalculadoraTrilhoEspecial[]>([]);
  const [linhas, setLinhas] = useState<LinhaState[]>(() => normalizarInicial(inicial));
  const [resultados, setResultados] = useState<Record<string, ResultadoTrilho>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const sequencia = useRef(0);

  useEffect(() => {
    // TTL curto: essa lista é editada pelo admin e precisa refletir exclusões/alterações
    // rapidamente em outras abas — não vale a pena guardar por muito tempo (10min padrão).
    getCacheado<{ calculadoras: CalculadoraTrilhoEspecial[] }>('calculadoras-trilho-especial-v1', '/calcular/calculadoras-trilho-especial', 60 * 1000)
      .then((r) => {
        setCalculadoras(r.calculadoras);
        // Rascunhos/orçamentos salvos antes do suporte a variantes têm calculadora_id
        // mas nenhum variante_id — preenche com a primeira variante do modelo já
        // escolhido, como o seletor faz ao trocar de calculadora manualmente.
        setLinhas((atuais) => atuais.map((l) => {
          if (!l.calculadora_id || l.variante_id) return l;
          const primeiraVariante = r.calculadoras.find((c) => c.id === l.calculadora_id)?.variantes?.[0]?.id;
          return primeiraVariante ? { ...l, variante_id: primeiraVariante } : l;
        }));
      })
      .catch(() => setCalculadoras([]))
      .finally(() => setCarregando(false));
  }, []);

  const assinatura = JSON.stringify(linhas.map((l) => ({ id: l.id, c: l.calculadora_id, v: l.variante_id, l: l.largura, q: l.quantidade, e: l.emendas })));
  useEffect(() => {
    const seq = ++sequencia.current;
    const validas = linhas.filter((l) => l.calculadora_id && l.variante_id && Number(l.largura) > 0 && Number(l.quantidade) > 0 && Number.isInteger(Number(l.emendas)) && Number(l.emendas) >= 0);
    setResultados({});
    setErros({});
    if (validas.length === 0) {
      setCalculando(false);
      return;
    }
    setCalculando(true);
    const timer = window.setTimeout(async () => {
      const novosResultados: Record<string, ResultadoTrilho> = {};
      const novosErros: Record<string, string> = {};
      await Promise.all(validas.map(async (linha) => {
        try {
          const r = await api.post<{ resultado: ResultadoTrilho }>('/calcular/trilho-especial', {
            calculadora_id: linha.calculadora_id,
            variante_id: linha.variante_id,
            largura: Number(linha.largura),
            quantidade: Number(linha.quantidade),
            emendas: Number(linha.emendas),
          });
          novosResultados[linha.id] = r.resultado;
        } catch (e) {
          novosErros[linha.id] = e instanceof ApiError ? e.message : 'Não foi possível calcular esta composição.';
        }
      }));
      if (seq !== sequencia.current) return;
      setResultados(novosResultados);
      setErros(novosErros);
      setCalculando(false);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  const estado = useMemo<ItensExtrasEstado>(() => {
    let total = 0;
    let incompleto = false;
    const itens: ItemExtraPayload[] = [];
    for (const linha of linhas) {
      const temConteudo = Boolean(linha.calculadora_id || linha.ambiente || linha.largura || linha.observacao || linha.quantidade !== '1' || linha.emendas !== '0');
      if (!temConteudo) continue;
      const resultado = resultados[linha.id];
      if (!linha.calculadora_id || !linha.variante_id || !(Number(linha.largura) > 0) || !(Number(linha.quantidade) > 0) || !Number.isInteger(Number(linha.emendas)) || Number(linha.emendas) < 0 || !resultadoCorresponde(linha, resultado) || erros[linha.id]) {
        incompleto = true;
        continue;
      }
      total += resultado.valor_total;
      itens.push({
        calculadora_id: linha.calculadora_id,
        variante_id: linha.variante_id,
        largura: Number(linha.largura),
        quantidade: Number(linha.quantidade),
        emendas: Number(linha.emendas),
        lado_motor: linha.lado_motor,
        tipo_abertura: linha.tipo_abertura,
        ...(linha.ambiente.trim() ? { ambiente: linha.ambiente.trim() } : {}),
        ...(linha.observacao.trim() ? { observacao: linha.observacao.trim() } : {}),
      });
    }
    return { total: Math.round(total * 100) / 100, count: itens.length, completos: !incompleto && !calculando, itens, calculando };
  }, [calculando, erros, linhas, resultados]);

  useEffect(() => { onEstado(estado); }, [estado, onEstado]);
  useEffect(() => {
    onSnapshot?.(linhas.map((l) => ({
      calculadora_id: l.calculadora_id,
      variante_id: l.variante_id,
      ambiente: l.ambiente,
      largura: l.largura,
      quantidade: l.quantidade,
      emendas: l.emendas,
      lado_motor: l.lado_motor,
      tipo_abertura: l.tipo_abertura,
      observacao: l.observacao,
    })));
    onDirtyChange?.(linhas.some((l) => l.calculadora_id || l.ambiente || l.largura || l.observacao || l.quantidade !== '1' || l.emendas !== '0'));
  }, [linhas, onDirtyChange, onSnapshot]);

  function alterar(id: string, patch: Partial<LinhaState>) {
    setLinhas((atuais) => atuais.map((l) => l.id === id ? { ...l, ...patch } : l));
  }

  function duplicar(index: number) {
    setLinhas((atuais) => {
      const novas = [...atuais];
      novas.splice(index + 1, 0, { ...atuais[index], id: crypto.randomUUID() });
      return novas;
    });
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="text-lg-ui font-medium">Calculadora de trilhos especiais</h4>
          <p className="text-xs-ui text-neutral-500">Escolha uma composição e informe largura, emendas por trilho e quantidade.</p>
        </div>
        <span className="font-mono tabular-nums text-sm-ui font-semibold">{formatBRL(estado.total)}</span>
      </div>

      {!carregando && calculadoras.length === 0 && (
        <div className="alert alert-warning text-xs-ui mb-3">Nenhuma calculadora de trilho especial está ativa. Solicite o cadastro ao administrador.</div>
      )}

      <div className="space-y-3">
        {linhas.map((linha, index) => {
          const resultado = resultados[linha.id];
          const calculado = resultadoCorresponde(linha, resultado);
          return (
            <div key={linha.id} className="rounded-sm border border-neutral-300 p-3 bg-neutral-50">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-3">
                  <label className="form-label">Modelo de trilho<span className="label-required">*</span></label>
                  <select className="input" value={linha.calculadora_id} onChange={(e) => {
                    const calculadora = calculadoras.find((c) => c.id === e.target.value);
                    alterar(linha.id, { calculadora_id: e.target.value, variante_id: calculadora?.variantes?.[0]?.id ?? '' });
                  }} disabled={carregando || calculadoras.length === 0}>
                    <option value="">{carregando ? 'Carregando calculadoras…' : 'Selecione a calculadora…'}</option>
                    {calculadoras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label className="form-label">Variante<span className="label-required">*</span></label>
                  <select className="input" value={linha.variante_id} onChange={(e) => alterar(linha.id, { variante_id: e.target.value })} disabled={!linha.calculadora_id}>
                    <option value="">Selecione a variante…</option>
                    {(calculadoras.find((c) => c.id === linha.calculadora_id)?.variantes ?? []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
                <div className="col-span-12 md:col-span-2">
                  <label className="form-label">Ambiente</label>
                  <input className="input" value={linha.ambiente} onChange={(e) => alterar(linha.id, { ambiente: e.target.value })} placeholder="Ex.: Sala" />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="form-label">Largura (m)<span className="label-required">*</span></label>
                  <input className="input input-mono" type="number" min={0} step={0.01} value={linha.largura} onChange={(e) => alterar(linha.id, { largura: e.target.value })} />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="form-label">Emendas/trilho<span className="label-required">*</span></label>
                  <input className="input input-mono" type="number" min={0} step={1} value={linha.emendas} onChange={(e) => alterar(linha.id, { emendas: e.target.value })} />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="form-label">Quantidade<span className="label-required">*</span></label>
                  <input className="input input-mono" type="number" min={1} step={1} value={linha.quantidade} onChange={(e) => alterar(linha.id, { quantidade: e.target.value })} />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <label className="form-label">Lado do motor<span className="label-required">*</span></label>
                  <select className="input" value={linha.lado_motor} onChange={(e) => alterar(linha.id, { lado_motor: e.target.value as LinhaState['lado_motor'] })}>
                    <option value="direito">Direito</option>
                    <option value="esquerdo">Esquerdo</option>
                  </select>
                </div>
                <div className="col-span-6 md:col-span-3">
                  <label className="form-label">Tipo de abertura<span className="label-required">*</span></label>
                  <select className="input" value={linha.tipo_abertura} onChange={(e) => alterar(linha.id, { tipo_abertura: e.target.value as LinhaState['tipo_abertura'] })}>
                    <option value="direita">Direita</option>
                    <option value="esquerda">Esquerda</option>
                  </select>
                </div>
              </div>

              {erros[linha.id] && <div className="helper-error mt-2">{erros[linha.id]}</div>}
              {calculando && linha.calculadora_id && linha.variante_id && Number(linha.largura) > 0 && Number.isInteger(Number(linha.emendas)) && Number(linha.emendas) >= 0 && !calculado && !erros[linha.id] && (
                <div className="text-xs-ui text-neutral-500 mt-2"><FontAwesomeIcon icon={faSpinner} spin /> Calculando composição…</div>
              )}

              {calculado && (
                <div className="mt-3 border border-neutral-200 rounded-sm bg-white overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-2xs-ui font-semibold text-neutral-500 bg-neutral-100">
                    <div className="col-span-6">Produto da composição</div>
                    <div className="col-span-2 text-right">Quantidade</div>
                    <div className="col-span-2 text-right">Preço</div>
                    <div className="col-span-2 text-right">Subtotal</div>
                  </div>
                  {resultado.componentes.map((componente) => (
                    <div key={`${componente.produto_id}-${componente.formula}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs-ui border-t border-neutral-100 items-center">
                      <div className="col-span-6 min-w-0">
                        <div className="truncate text-neutral-700" title={componente.nome}>{componente.nome}</div>
                        <div className="text-2xs-ui text-neutral-500 font-mono">{componente.codigo_interno} · {componente.formula}</div>
                      </div>
                      <div className="col-span-2 text-right font-mono tabular-nums">{formatNum(componente.quantidade, 4)}</div>
                      <div className="col-span-2 text-right font-mono tabular-nums">{formatBRL(componente.preco_venda)}</div>
                      <div className="col-span-2 text-right font-mono tabular-nums font-semibold">{formatBRL(componente.subtotal)}</div>
                    </div>
                  ))}
                  <div className="flex justify-end gap-4 px-3 py-2 border-t border-neutral-200 bg-neutral-100 text-xs-ui">
                    <span className="text-neutral-600">Total da composição</span>
                    <strong className="font-mono tabular-nums text-neutral-800">{formatBRL(resultado.valor_total)}</strong>
                  </div>
                </div>
              )}

              <div className="mt-2 grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 md:col-span-8">
                  <input className="input" value={linha.observacao} onChange={(e) => alterar(linha.id, { observacao: e.target.value })} placeholder="Observação opcional" />
                </div>
                <div className="col-span-12 md:col-span-4 flex justify-end gap-3">
                  <button type="button" className="text-primary hover:opacity-80 text-xs-ui flex items-center gap-1" onClick={() => duplicar(index)}><FontAwesomeIcon icon={faCopy} /> Duplicar</button>
                  <button type="button" className="text-error hover:opacity-80 text-xs-ui flex items-center gap-1" onClick={() => setLinhas((atuais) => atuais.filter((l) => l.id !== linha.id))} disabled={linhas.length === 1}><FontAwesomeIcon icon={faTrash} /> Remover</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-default w-full mt-3" onClick={() => setLinhas((atuais) => [...atuais, vazia()])}>
        <FontAwesomeIcon icon={faPlus} /> Adicionar trilho calculado
      </button>
    </div>
  );
}
