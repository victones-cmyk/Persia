// apps/web/src/lib/rascunhoLocal.ts
// Autosave LOCAL (no navegador) do orçamento em preenchimento — protege contra
// fechar/recarregar sem querer. NÃO vai ao servidor; é por navegador/máquina.
// Para rascunho persistido no banco, use "Salvar como rascunho".

/** Snapshot bruto de um item (janela) de persiana — strings (estado parcial do form). */
export interface PersianaItemSnap {
  ambiente: string;
  tipo: string; // produto sob medida POR ITEM (Victor 26/06/2026)
  tecido_id: string;
  cor: string;
  acionamento: string;
  largura: string;
  altura: string;
  tc: string;
  tcManual: boolean;
  rolamento: string;
  base: string;
  comando?: string;
  bando_codigo?: string;
  bando_nome?: string;
  fixacao_instalacao?: string;
  instalacao_id: string;
  instManual: boolean;
}
export interface PersianaSnapshot {
  tipo: string; // legado: tipo representativo (cada item tem o seu)
  itens: PersianaItemSnap[];
}

/** Snapshot bruto de uma cortina (estado parcial do CortinaCard). */
export interface CortinaCardSnap {
  ambiente: string;
  modelo: string;
  modeloCortinaNome?: string;
  fixacao: string;
  desconto?: string;
  largura: string;
  altura: string;
  tamanhoBarra: string;
  tipoBarra: string;
  aberturas?: string;
  bainhasLaterais?: string;
  jaPossuiVarao?: boolean;
  camadas: { nome?: string; tecidoId: string; franzido: string; modelo?: string; metodoAltura?: 'emenda' | 'barra_postica'; costuradoQuantidade?: 'mesma_quantidade' | 'proporcao_franzido' }[];
  acessorioSel: Record<string, string>;
  qtdManual: Record<string, string>;
  instalacaoId?: string; // tipo de instalação por cortina (Victor 26/06/2026)
}
export interface CortinaSnapshot {
  cortinas: CortinaCardSnap[];
  instalacao_valor?: string; // legado (instalação agora é por cortina)
}

export interface ProdutoExtraSnap {
  produto_id?: string;
  calculadora_id?: string;
  ambiente: string;
  largura?: string;
  quantidade: string;
  observacao: string;
}

export interface RascunhoLocal {
  tipo: 'persiana' | 'cortina' | 'misto';
  cliente: { id: string; nome: string } | null;
  loja_id?: string;
  persiana?: PersianaSnapshot;
  cortina?: CortinaSnapshot;
  trilhos_especiais?: ProdutoExtraSnap[];
  produtos_avulsos?: ProdutoExtraSnap[];
  instalacao_valor?: string; // legado (instalação agora é por item)
  rt_pct?: string; // RT do arquiteto (% do orçamento todo)
  ts: number;
}

const CHAVE = 'persia:orcamento-rascunho-local';

// Validade do rascunho local (12h). Evita que dados de cliente fiquem
// indefinidamente legíveis em estações compartilhadas entre vendedores.
const VALIDADE_MS = 12 * 60 * 60 * 1000;

export function lerRascunhoLocal(): RascunhoLocal | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as RascunhoLocal;
    if (!r || (r.tipo !== 'persiana' && r.tipo !== 'cortina' && r.tipo !== 'misto')) return null;
    // Descarta rascunhos antigos (e os de versões sem carimbo de tempo).
    if (typeof r.ts !== 'number' || Date.now() - r.ts > VALIDADE_MS) {
      limparRascunhoLocal();
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

export function salvarRascunhoLocal(r: RascunhoLocal): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {
    /* localStorage indisponível/cheio — ignora */
  }
}

export function limparRascunhoLocal(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
}
