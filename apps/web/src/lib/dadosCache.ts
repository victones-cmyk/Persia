import { api } from './api';

const memoria = new Map<string, { expiraEm: number; valor: unknown }>();
const emVoo = new Map<string, Promise<unknown>>();
const geracoes = new Map<string, number>();

function lerSessao<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiraEm: number; valor: T };
    if (Date.now() > parsed.expiraEm) {
      sessionStorage.removeItem(key);
      return null;
    }
    memoria.set(key, parsed);
    return parsed.valor;
  } catch {
    return null;
  }
}

function salvarSessao<T>(key: string, valor: T, ttlMs: number): void {
  const item = { expiraEm: Date.now() + ttlMs, valor };
  memoria.set(key, item);
  try {
    sessionStorage.setItem(key, JSON.stringify(item));
  } catch {
    // Cache é otimização; se o navegador negar storage, segue sem persistir.
  }
}

export function getCacheado<T>(key: string, url: string, ttlMs = 10 * 60 * 1000): Promise<T> {
  const atual = memoria.get(key);
  if (atual && Date.now() <= atual.expiraEm) return Promise.resolve(atual.valor as T);

  const sessao = lerSessao<T>(key);
  if (sessao) return Promise.resolve(sessao);

  const existente = emVoo.get(key);
  if (existente) return existente as Promise<T>;

  const geracaoNoInicio = geracoes.get(key) ?? 0;
  const req = api.get<T>(url)
    .then((valor) => {
      // Uma sincronização pode invalidar a chave enquanto a requisição está em
      // andamento. Nesse caso entrega a resposta ao caller, mas não a recacheia.
      if ((geracoes.get(key) ?? 0) === geracaoNoInicio) salvarSessao(key, valor, ttlMs);
      return valor;
    })
    .finally(() => emVoo.delete(key));
  emVoo.set(key, req);
  return req;
}

export function invalidarCacheado(key: string): void {
  geracoes.set(key, (geracoes.get(key) ?? 0) + 1);
  memoria.delete(key);
  emVoo.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Cache é opcional; segue mesmo quando o storage não está disponível.
  }
}

export function invalidarCacheadosPorPrefixo(prefixo: string): void {
  const chaves = new Set<string>();
  for (const key of memoria.keys()) if (key.startsWith(prefixo)) chaves.add(key);
  for (const key of emVoo.keys()) if (key.startsWith(prefixo)) chaves.add(key);
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefixo)) chaves.add(key);
    }
  } catch {
    // Cache é opcional; as chaves em memória ainda serão removidas.
  }
  for (const key of chaves) invalidarCacheado(key);
}
