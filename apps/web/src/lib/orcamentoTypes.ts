// apps/web/src/lib/orcamentoTypes.ts
export type StatusOrcamento = 'rascunho' | 'enviado' | 'erro' | 'cancelado';

export interface OrcamentoListItem {
  id: string;
  tipo_produto: string;
  status: StatusOrcamento;
  nome_cliente: string;
  gc_orcamento_id: string | null;
  valor_final: string;
  valor_bruto: string;
  desconto_pct: string;
  criado_em: string;
  usuario?: { nome: string } | null;
  loja?: { nome: string } | null;
}

export interface ItemOrcamento {
  id: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  preco_unitario: string;
  valor_total: string;
}

export interface OrcamentoDetalhe extends OrcamentoListItem {
  tecido_nome: string;
  tecido_codigo_gc: string;
  largura_m: string;
  altura_m: string;
  dimensao_m: string | null;
  tc_m: string | null;
  acionamento: string | null;
  cor_acessorio: string | null;
  rolamento: string | null;
  gc_produto_id: string | null;
  erro_gc: string | null;
  itens: ItemOrcamento[];
}

export interface Paginacao {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}

export const STATUS_LABEL: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  erro: 'Erro',
  cancelado: 'Cancelado',
};
