// apps/web/src/lib/rascunhoLocal.ts
// Autosave LOCAL (no navegador) do orçamento em preenchimento — protege contra
// fechar/recarregar sem querer. NÃO vai ao servidor; é por navegador/máquina.
// Para rascunho persistido no banco, use "Salvar como rascunho".

/** Snapshot bruto de um item (janela) de persiana — strings (estado parcial do form). */
export interface PersianaItemSnap {
  ambiente: string;
  tecido_id: string;
  cor: string;
  acionamento: string;
  largura: string;
  altura: string;
  tc: string;
  tcManual: boolean;
  rolamento: string;
  base: string;
}
export interface PersianaSnapshot {
  tipo: string;
  itens: PersianaItemSnap[];
}

/** Snapshot bruto de uma cortina (estado parcial do CortinaCard). */
export interface CortinaCardSnap {
  ambiente: string;
  modelo: string;
  fixacao: string;
  largura: string;
  altura: string;
  tamanhoBarra: string;
  tipoBarra: string;
  jaPossuiVarao?: boolean;
  camadas: { tecidoId: string; franzido: string }[];
  acessorioSel: Record<string, string>;
  qtdManual: Record<string, string>;
}
export interface CortinaSnapshot {
  cortinas: CortinaCardSnap[];
  instalacao_valor: string;
}

export interface RascunhoLocal {
  tipo: 'persiana' | 'cortina' | 'misto';
  cliente: { id: string; nome: string } | null;
  persiana?: PersianaSnapshot;
  cortina?: CortinaSnapshot;
  instalacao_valor?: string; // instalação por peça (tela única/misto)
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
