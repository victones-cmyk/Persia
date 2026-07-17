import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { api } from '../lib/api';
import { formatBRL } from '../lib/formatacao';
import { BuscaSelect } from './BuscaSelect';
import type { ProdutoExtraSnap } from '../lib/rascunhoLocal';

export interface ProdutoCatalogoOrcamento {
  id: string;
  nome: string;
  codigo_interno: string;
  grupo_id: string;
  nome_grupo: string;
  preco_venda: number;
  valor_custo: number;
}
export interface ItemExtraPayload {
  produto_id: string;
  ambiente?: string;
  largura?: number;
  quantidade: number;
  observacao?: string;
}

export interface ItensExtrasEstado {
  total: number;
  count: number;
  completos: boolean;
  itens: ItemExtraPayload[];
}

interface LinhaState {
  id: string;
  produto_id: string;
  ambiente: string;
  largura: string;
  quantidade: string;
  observacao: string;
}

const vazio = (): LinhaState => ({
  id: crypto.randomUUID(),
  produto_id: '',
  ambiente: '',
  largura: '',
  quantidade: '1',
  observacao: '',
});

function normalizarInicial(snap?: ProdutoExtraSnap[]): LinhaState[] {
  if (!snap?.length) return [vazio()];
  return snap.map((s) => ({
    id: crypto.randomUUID(),
    produto_id: s.produto_id ?? '',
    ambiente: s.ambiente ?? '',
    largura: s.largura ?? '',
    quantidade: s.quantidade ?? '1',
    observacao: s.observacao ?? '',
  }));
}

export function ItensExtrasOrcamento({
  titulo,
  modo,
  inicial,
  onEstado,
  onSnapshot,
  onDirtyChange,
}: {
  titulo: string;
  modo: 'trilho' | 'avulso';
  inicial?: ProdutoExtraSnap[];
  onEstado: (estado: ItensExtrasEstado) => void;
  onSnapshot?: (snap: ProdutoExtraSnap[]) => void;
  onDirtyChange?: (sujo: boolean) => void;
}) {
  const [produtos, setProdutos] = useState<ProdutoCatalogoOrcamento[]>([]);
  const [linhas, setLinhas] = useState<LinhaState[]>(() => normalizarInicial(inicial));
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.get<{ produtos: ProdutoCatalogoOrcamento[] }>('/calcular/produtos')
      .then((r) => setProdutos(r.produtos))
      .catch(() => setProdutos([]))
      .finally(() => setCarregando(false));
  }, []);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const estado = useMemo<ItensExtrasEstado>(() => {
    let total = 0;
    const itens: ItemExtraPayload[] = [];
    let incompleto = false;
    for (const linha of linhas) {
      const produto = porId.get(linha.produto_id);
      const quantidade = Number(linha.quantidade);
      const largura = modo === 'trilho' ? Number(linha.largura) : undefined;
      const temConteudo = Boolean(linha.produto_id || linha.ambiente || linha.largura || linha.observacao || linha.quantidade !== '1');
      if (!temConteudo) continue;
      if (!produto || !(quantidade > 0) || (modo === 'trilho' && !(Number(largura) > 0))) {
        incompleto = true;
        continue;
      }
      const subtotal = produto.preco_venda * quantidade * (modo === 'trilho' ? Number(largura) : 1);
      total += subtotal;
      itens.push({
        produto_id: produto.id,
        quantidade,
        ...(modo === 'trilho' ? { largura: Number(largura) } : {}),
        ...(linha.ambiente.trim() ? { ambiente: linha.ambiente.trim() } : {}),
        ...(linha.observacao.trim() ? { observacao: linha.observacao.trim() } : {}),
      });
    }
    return { total: Math.round(total * 100) / 100, count: itens.length, completos: !incompleto, itens };
  }, [linhas, modo, porId]);

  useEffect(() => { onEstado(estado); }, [estado, onEstado]);
  useEffect(() => {
    onSnapshot?.(linhas.map((l) => ({
      produto_id: l.produto_id,
      ambiente: l.ambiente,
      ...(modo === 'trilho' ? { largura: l.largura } : {}),
      quantidade: l.quantidade,
      observacao: l.observacao,
    })));
    onDirtyChange?.(linhas.some((l) => l.produto_id || l.ambiente || l.largura || l.observacao || l.quantidade !== '1'));
  }, [linhas, modo, onDirtyChange, onSnapshot]);

  function alterar(id: string, patch: Partial<LinhaState>) {
    setLinhas((atuais) => atuais.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function duplicar(index: number) {
    setLinhas((atuais) => {
      const next = [...atuais];
      next.splice(index + 1, 0, { ...atuais[index], id: crypto.randomUUID() });
      return next;
    });
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h4 className="text-lg-ui font-medium">{titulo}</h4>
        <span className="font-mono tabular-nums text-sm-ui font-semibold">{formatBRL(estado.total)}</span>
      </div>

      <div className="space-y-3">
        {linhas.map((linha, index) => {
          const produto = porId.get(linha.produto_id);
          const qtd = Number(linha.quantidade);
          const largura = Number(linha.largura);
          const subtotal = produto ? produto.preco_venda * (qtd > 0 ? qtd : 0) * (modo === 'trilho' && largura > 0 ? largura : 1) : 0;
          return (
            <div key={linha.id} className="rounded-sm border border-neutral-300 p-3" style={{ background: 'var(--neutral-50)' }}>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-5">
                  <label className="form-label">Produto</label>
                  <BuscaSelect
                    options={produtos.map((p) => ({ id: p.id, nome: `${p.nome}${p.codigo_interno ? ` (${p.codigo_interno})` : ''}`, preco: p.preco_venda }))}
                    value={linha.produto_id}
                    onChange={(produto_id) => alterar(linha.id, { produto_id })}
                    disabled={carregando}
                    placeholder={carregando ? 'Carregando produtos...' : 'Buscar produto...'}
                    ariaLabel={`Buscar produto ${index + 1}`}
                  />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label className="form-label">Ambiente</label>
                  <input className="input" value={linha.ambiente} onChange={(e) => alterar(linha.id, { ambiente: e.target.value })} placeholder="Ex.: Sala" />
                </div>
                {modo === 'trilho' && (
                  <div className="col-span-6 md:col-span-1">
                    <label className="form-label">Largura</label>
                    <input className="input input-mono" type="number" min={0} step={0.01} value={linha.largura} onChange={(e) => alterar(linha.id, { largura: e.target.value })} />
                  </div>
                )}
                <div className="col-span-6 md:col-span-1">
                  <label className="form-label">Qtd</label>
                  <input className="input input-mono" type="number" min={0} step={1} value={linha.quantidade} onChange={(e) => alterar(linha.id, { quantidade: e.target.value })} />
                </div>
                <div className={modo === 'trilho' ? 'col-span-12 md:col-span-2' : 'col-span-12 md:col-span-3'}>
                  <div className="text-2xs-ui font-bold uppercase text-neutral-500">Subtotal</div>
                  <div className="font-mono tabular-nums text-sm-ui font-semibold text-neutral-800">{formatBRL(subtotal)}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 md:col-span-8">
                  <input className="input" value={linha.observacao} onChange={(e) => alterar(linha.id, { observacao: e.target.value })} placeholder="Observação opcional" />
                </div>
                <div className="col-span-12 md:col-span-4 flex justify-end gap-3">
                  <button type="button" className="text-primary hover:opacity-80 text-xs-ui flex items-center gap-1" onClick={() => duplicar(index)}>
                    <FontAwesomeIcon icon={faCopy} /> Duplicar
                  </button>
                  <button type="button" className="text-error hover:opacity-80 text-xs-ui flex items-center gap-1" onClick={() => setLinhas((atuais) => atuais.filter((l) => l.id !== linha.id))} disabled={linhas.length === 1}>
                    <FontAwesomeIcon icon={faTrash} /> Remover
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-default w-full mt-3" onClick={() => setLinhas((atuais) => [...atuais, vazio()])}>
        <FontAwesomeIcon icon={faPlus} /> {modo === 'trilho' ? 'Adicionar trilho' : 'Adicionar produto'}
      </button>
    </div>
  );
}
