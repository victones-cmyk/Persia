// apps/web/src/lib/orcamentoTypes.ts
export type StatusOrcamento = 'rascunho' | 'enviado' | 'erro' | 'cancelado';

export interface OrcamentoListItem {
  id: string;
  tipo_produto: string;
  status: StatusOrcamento;
  usuario_id?: string;
  nome_cliente: string;
  gc_cliente_id?: string | null;
  gc_orcamento_id: string | null;
  gc_codigo: string | null;
  gc_pedido_id?: string | null;
  gc_pedido_codigo?: string | null;
  pedido_confirmado_em?: string | null;
  pedido_entrega_em?: string | null;
  erro_gc?: string | null;
  valor_final: string;
  valor_bruto: string;
  criado_em: string;
  usuario?: { nome: string } | null;
  loja?: { nome: string } | null;
}

/** Snapshot de um item (janela) salvo em itens_json. */
export interface ItemSnapshot {
  origem?: 'persiana' | 'cortina' | 'trilho';
  emendas?: number;
  lado_motor?: string;
  tipo_abertura?: string;
  ambiente?: string;
  tipo?: string; // produto sob medida do item (Victor 26/06/2026)
  instalacao_id?: string | null;
  instalacao_nome?: string | null;
  tecido_codigo_gc: string;
  tecido_nome: string;
  dimensao_m: number;
  largura_m: number;
  altura_m: number;
  tc_m: number;
  cor_acessorio: string;
  acionamento: string;
  rolamento: string | null;
  base: string | null;
  comando?: string | null;
  bando_codigo?: string | null;
  bando_nome?: string | null;
  emissor?: boolean | null;
  emissor_codigo?: string | null;
  emissor_nome?: string | null;
  canal?: string | null;
  fixacao_instalacao?: string | null;
  desconto?: string | null;
  fixacao?: string | null;
  tamanho_barra?: number | null;
  tipo_barra?: 'simples' | 'dupla' | string | null;
  qtd_venda: number;
  qtd_producao: number;
  valor_bruto: number;
  valor_final: number;
  valor_custo: number;
  gc_produto_id: string | null;
  nome_produto: string;
  componentes: { grupo: string; descricao: string; quantidade: number; unidade: string; produto_id?: string | null }[];
}

export interface OrcamentoDetalhe extends OrcamentoListItem {
  loja_id: string | null;
  gc_cliente_id: string | null;
  /** Entrada bruta do formulário (para reabrir o rascunho na calculadora). */
  entrada_json?: Record<string, unknown> | null;
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
  itens_json: ItemSnapshot[] | null;
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
