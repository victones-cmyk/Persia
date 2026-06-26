// apps/web/src/lib/calcTypes.ts
// Tipos do domínio de cálculo de persiana, espelhando o backend (services/calc).

export type TipoPersiana =
  | 'persiana_rolo_blackout'
  | 'persiana_rolo_screen'
  | 'persiana_rolo_translucido'
  | 'persiana_rolo_double_vision'
  | 'persiana_romana_blackout'
  | 'persiana_romana_screen'
  | 'persiana_romana_translucido';

export type Cor = 'Branco' | 'Bege' | 'Cinza' | 'Preto';
export type Acionamento =
  | 'com_bando'
  | 'com_barra'
  | 'motorizado_com_bando'
  | 'motorizado_sem_bando';

export interface TecidoOpcao {
  id: string;
  nome: string;
  dimensao_m: number;
  preco_venda: number;
}

/** Tipo de instalação (grupo INSTALAÇÃO do GestãoClick) — embutido no preço do produto. */
export interface TipoInstalacao {
  id: string;
  nome: string;
  preco: number;
}

export interface ComponenteCalculado {
  grupo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
}

/** Linha do breakdown de preço (motor de componentes): qtd × preço = subtotal. */
export interface LinhaCustoPersiana {
  codigo_interno: string;
  descricao: string;
  quantidade: number;
  preco: number;
  subtotal: number;
}

export interface ResultadoPersiana {
  tipo?: TipoPersiana;
  codigo_gc?: string;
  familia?: 'rolo' | 'romana';
  largura: number;
  altura: number;
  dimensao: number;
  altura_efetiva?: number;
  margem?: number;
  tc: number;
  qtd_producao: number;
  qtd_venda: number;
  preco_tecido: number | null;
  valor_bruto: number | null;
  componentes: ComponenteCalculado[];
  /** Breakdown novo (motor de componentes): cada componente com preço do GestãoClick. */
  itens?: LinhaCustoPersiana[];
  tecido?: LinhaCustoPersiana;
  variante?: string;
}

export interface CalcularResposta {
  resultado: ResultadoPersiana;
  tecido: TecidoOpcao;
}

/** Campos de UM item (janela) enviados ao backend (cálculo em lote / orçamento). */
export interface ItemInput {
  ambiente?: string;
  tipo?: TipoPersiana; // produto sob medida POR ITEM (Victor 26/06/2026)
  tecido_id: string;
  cor_acessorio: Cor;
  acionamento: Acionamento;
  largura: number;
  altura: number;
  tc?: number;
  rolamento?: string | null;
  base?: string | null;
  instalacao_id?: string | null; // tipo de instalação embutido no produto
}

/** Resultado por item do cálculo em lote. */
export type ItemResultado =
  | { ok: true; index: number; resultado: ResultadoPersiana; tecido: TecidoOpcao }
  | {
      ok: false;
      index: number;
      error: string;
      message: string;
      dimensao_max?: number;
      alternativos?: { id: string; nome: string; dimensao_m: number }[];
    };

export interface CalcularLoteResposta {
  itens: ItemResultado[];
  total_bruto: number;
}

/** Um item já calculado (ok), com a entrada original para reenvio. */
export interface ItemCalculado {
  input: ItemInput;
  resultado: ResultadoPersiana;
  tecido: TecidoOpcao;
}

/** Orçamento calculado (multi-itens) pronto para o painel de resultado. */
export interface OrcamentoCalculado {
  tipo: TipoPersiana;
  itens: ItemCalculado[];
  total_bruto: number;
  /** Há item(ns) com campos obrigatórios não preenchidos → bloqueia enviar/salvar. */
  incompleto?: boolean;
}

export interface ClienteResumo {
  id: string;
  nome: string;
  tipo_pessoa: string;
  documento: string | null;
}

export interface OrcamentoSalvo {
  id: string;
  status: 'rascunho' | 'enviado' | 'erro' | 'cancelado';
  gc_orcamento_id: string | null;
  valor_final: string;
  erro_gc?: string | null;
}

export interface RN01Resposta {
  error: 'RN01_LARGURA_EXCEDIDA';
  message: string;
  dimensao_max: number;
  alternativos: { id: string; nome: string; dimensao_m: number }[];
}

export const TIPOS_PERSIANA: { value: TipoPersiana; label: string }[] = [
  { value: 'persiana_rolo_blackout', label: 'Persiana Rolo Blackout' },
  { value: 'persiana_rolo_screen', label: 'Persiana Rolo Screen' },
  { value: 'persiana_rolo_translucido', label: 'Persiana Rolo Translúcido' },
  { value: 'persiana_rolo_double_vision', label: 'Persiana Double Vision' },
  { value: 'persiana_romana_blackout', label: 'Persiana Romana Blackout' },
  { value: 'persiana_romana_screen', label: 'Persiana Romana Screen' },
  { value: 'persiana_romana_translucido', label: 'Persiana Romana Translúcido' },
];

export const CORES: Cor[] = ['Branco', 'Bege', 'Cinza', 'Preto'];

export const ACIONAMENTOS: { value: Acionamento; label: string }[] = [
  { value: 'com_bando', label: 'Com Bandô' },
  { value: 'com_barra', label: 'Com Barra Estabilizadora' },
  { value: 'motorizado_com_bando', label: 'Motorizado com Bandô' },
  { value: 'motorizado_sem_bando', label: 'Motorizado sem Bandô' },
];

export const ROLAMENTOS = ['Dianteiro', 'Traseiro'] as const;
