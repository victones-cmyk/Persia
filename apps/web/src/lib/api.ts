// apps/web/src/lib/api.ts
// Cliente HTTP fino sobre fetch. Sempre envia cookies de sessão (credentials: include).
// NUNCA acessa process.env (regra inviolável SRD §17) — usa caminhos relativos via proxy/origem.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Handler global para 401 inesperado (sessão expirada em rota protegida).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

// Endpoints onde 401 é um resultado esperado (não dispara o handler de sessão expirada).
const AUTH_EXPECTED_401 = new Set(['/auth/me', '/auth/login']);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const err = data as { error?: string; message?: string } | null;
    // Só dispara logout global em 401 de SESSÃO (NAO_AUTENTICADO). 401 de regra de
    // negócio NÃO deve deslogar o usuário.
    if (res.status === 401 && err?.error === 'NAO_AUTENTICADO' && !AUTH_EXPECTED_401.has(path)) {
      onUnauthorized?.();
    }
    throw new ApiError(res.status, err?.error ?? 'ERRO', err?.message ?? 'Erro na requisição', data);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
