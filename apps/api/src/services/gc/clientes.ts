// apps/api/src/services/gc/clientes.ts
// Busca e cadastro de clientes no GestãoClick (SRD §11). Debounce de 300ms é no frontend.
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

export interface EnderecoCliente {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

export interface NovoCliente {
  tipo_pessoa: 'PF' | 'PJ';
  nome: string;
  razao_social?: string;
  cpf?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  endereco?: EnderecoCliente;
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

/** Cliente com contato e endereço — usado para pré-preencher o agendamento. */
export interface ClienteCompleto extends ClienteResumo {
  telefone: string | null;
  celular: string | null;
  endereco: EnderecoCliente | null;
}

interface GcEnderecoRaw {
  endereco?: { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; nome_cidade?: string; estado?: string };
}

/**
 * Busca um cliente pelo id, com endereço. Evita que o vendedor redigite
 * endereço e telefone ao agendar uma visita — o dado já está no GestãoClick.
 */
export async function buscarClientePorId(id: string): Promise<ClienteCompleto | null> {
  const env = await gcRequest<GcEnvelope<GcClienteRaw & { telefone?: string; celular?: string; enderecos?: GcEnderecoRaw[] }>>({
    method: 'GET',
    url: `/api/clientes/${encodeURIComponent(id)}`,
  });
  const c = env.data;
  if (!c?.id) return null;

  const e = c.enderecos?.[0]?.endereco;
  return {
    id: c.id,
    nome: c.nome,
    tipo_pessoa: c.tipo_pessoa,
    documento: c.cnpj || c.cpf || null,
    telefone: c.telefone || null,
    celular: c.celular || null,
    endereco: e
      ? {
          cep: e.cep || '',
          logradouro: e.logradouro || '',
          numero: e.numero || '',
          complemento: e.complemento || '',
          bairro: e.bairro || '',
          cidade: e.nome_cidade || '',
          estado: e.estado || '',
        }
      : null,
  };
}

/** Cria um cliente no GestãoClick (PF ou PJ), com contato e endereço opcionais. */
export async function criarCliente(input: NovoCliente): Promise<ClienteResumo> {
  const nome = input.nome.trim();
  const tipoPessoa = input.tipo_pessoa === 'PJ' ? 'PJ' : 'PF';

  const data: Record<string, unknown> = {
    tipo_pessoa: tipoPessoa,
    nome,
    ativo: '1',
  };
  if (input.telefone?.trim()) data.telefone = input.telefone.trim();
  if (input.celular?.trim()) data.celular = input.celular.trim();
  if (input.email?.trim()) data.email = input.email.trim();

  if (tipoPessoa === 'PJ') {
    if (input.cnpj?.trim()) data.cnpj = input.cnpj.trim();
    if (input.razao_social?.trim()) data.razao_social = input.razao_social.trim();
  } else if (input.cpf?.trim()) {
    data.cpf = input.cpf.trim();
  }

  const end = input.endereco;
  const temEndereco = end && (end.cep || end.logradouro || end.numero || end.bairro || end.cidade || end.estado);
  if (temEndereco) {
    data.enderecos = [{
      endereco: {
        cep: end!.cep ?? '',
        logradouro: end!.logradouro ?? '',
        numero: end!.numero ?? '',
        complemento: end!.complemento ?? '',
        bairro: end!.bairro ?? '',
        cidade: end!.cidade ?? '',
        estado: end!.estado ?? '',
      },
    }];
  }

  const env = await gcRequest<GcEnvelope<GcClienteRaw>>({
    method: 'POST',
    url: '/api/clientes',
    data,
  });

  const c = env.data;
  if (!c?.id) {
    throw new Error('GestãoClick não retornou o id do cliente.');
  }

  return {
    id: c.id,
    nome: c.nome ?? nome,
    tipo_pessoa: c.tipo_pessoa ?? tipoPessoa,
    documento: c.cnpj || c.cpf || null,
  };
}
