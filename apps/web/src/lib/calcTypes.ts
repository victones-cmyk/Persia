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

export interface ComponenteCalculado {
  grupo: 'fixo' | 'condicional' | 'base';
  descricao: string;
  quantidade: number;
  unidade: string;
}

export interface ResultadoPersiana {
  tipo: TipoPersiana;
  codigo_gc: string;
  familia: 'rolo' | 'romana';
  largura: number;
  altura: number;
  dimensao: number;
  altura_efetiva: number;
  margem: number;
  tc: number;
  qtd_producao: number;
  qtd_venda: number;
  preco_tecido: number | null;
  valor_bruto: number | null;
  componentes: ComponenteCalculado[];
}

export interface CalcularResposta {
  resultado: ResultadoPersiana;
  tecido: TecidoOpcao;
}

/** Snapshot dos campos do formulário usados no envio ao GestãoClick (Fase 5). */
export interface PersianaInputs {
  tipo: TipoPersiana;
  largura: number;
  altura: number;
  cor_acessorio: Cor;
  acionamento: Acionamento;
  tc?: number;
  rolamento?: string;
  tecido_id: string;
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
