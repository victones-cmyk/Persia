// apps/web/src/lib/filtrosSessao.ts
// Persistência dos filtros da lista de Orçamentos APENAS durante a sessão logada.
// Usa sessionStorage: mantém-se ao atualizar a página (F5), mas é limpo no
// login e no logout (ver useAuth) — então cada novo login começa com "Todo o período".

const CHAVE = 'persia:orcamentos:filtros';

export interface FiltrosOrcamento {
  status?: string;
  cliente?: string;
  periodo?: string;
  dataDe?: string;
  dataAte?: string;
  pagina?: number;
}

export function lerFiltrosOrcamento(): FiltrosOrcamento | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as FiltrosOrcamento) : null;
  } catch {
    return null;
  }
}

export function salvarFiltrosOrcamento(f: FiltrosOrcamento): void {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(f));
  } catch {
    /* sessionStorage indisponível — ignora */
  }
}

export function limparFiltrosOrcamento(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
}
