// apps/api/src/services/gc/clientes.ts
// Busca de clientes no GestãoClick (SRD §11). Debounce de 300ms é no frontend.
// No GC, cpf e cnpj são campos separados (não há cpf_cnpj único).

import { gcRequest, type GcEnvelope } from './client';

interface GcClienteRaw {
  id: string;
  nome: string;
  tipo_pessoa: string;
  cpf: string | null;
  cnpj: string | null;
}

export interface ClienteResumo {
  id: string;
  nome: string;
  tipo_pessoa: string;
  documento: string | null;
}

/** Busca clientes ativos por nome ou documento (1ª página, máx 100). */
export async function buscarClientes(query: string): Promise<ClienteResumo[]> {
  const termo = query.trim();
  if (termo.length < 2) return [];

  // Heurística: se começa com dígito, busca por documento; senão por nome.
  const params: Record<string, string | number> = { situacao: 1, pagina: 1 };
  if (/^\d/.test(termo)) params.cpf_cnpj = termo;
  else params.nome = termo;

  const env = await gcRequest<GcEnvelope<GcClienteRaw[]>>({
    method: 'GET',
    url: '/api/clientes',
    params,
  });

  return (env.data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo_pessoa: c.tipo_pessoa,
    documento: c.cnpj || c.cpf || null,
  }));
}
