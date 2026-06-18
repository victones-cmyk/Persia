// apps/web/src/lib/rascunhoLocal.ts
// Autosave LOCAL (no navegador) do orçamento em preenchimento — protege contra
// fechar/recarregar sem querer. NÃO vai ao servidor; é por navegador/máquina.
// Para rascunho persistido no banco, use "Salvar como rascunho".

/** Snapshot bruto de um item (janela) de persiana — strings (estado parcial do form). */
export interface PersianaItemSnap {
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
  camadas: { tecidoId: string; franzido: string }[];
  acessorioSel: Record<string, string>;
  qtdManual: Record<string, string>;
}
export interface CortinaSnapshot {
  cortinas: CortinaCardSnap[];
  instalacao_valor: string;
}

export interface RascunhoLocal {
  tipo: 'persiana' | 'cortina';
  cliente: { id: string; nome: string } | null;
  persiana?: PersianaSnapshot;
  cortina?: CortinaSnapshot;
  ts: number;
}

const CHAVE = 'persia:orcamento-rascunho-local';

export function lerRascunhoLocal(): RascunhoLocal | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as RascunhoLocal;
    if (!r || (r.tipo !== 'persiana' && r.tipo !== 'cortina')) return null;
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
