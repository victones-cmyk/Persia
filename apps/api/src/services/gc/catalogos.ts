// apps/api/src/services/gc/catalogos.ts
// Leitura de catálogos do GestãoClick (SRD §11): grupos, produtos (paginado),
// lojas, usuários, situações de orçamento.

import { gcRequest, type GcEnvelope } from './client';

export interface GcAtributo {
  atributo: { tipo: string; conteudo: string; descricao: string; atributo_id: number };
}

export interface GcProduto {
  id: string;
  nome: string;
  codigo_interno: string;
  ativo: string;
  grupo_id: string;
  nome_grupo: string;
  largura: string;
  valor_venda: string;
  valores: { tipo_id: string; nome_tipo: string; valor_venda: string; valor_custo: string }[];
  // Campos extras do produto. A largura do rolo é cadastrada aqui (descricao "LARGURA").
  atributos?: GcAtributo[];
}

export interface GcGrupo {
  id: string;
  grupo_pai_id: string;
  nome: string;
}

export interface GcLoja {
  id: string;
  nome: string;
}
export interface GcUsuario {
  id: string;
  nome: string;
}
export interface GcSituacao {
  id: string;
  nome: string;
  tipo_lancamento: number | null;
}
export interface GcFuncionario {
  id: string;
  nome: string;
  ativo: string;
}

// ID do grupo TECIDO no GestãoClick (verificado via GET /api/grupos_produtos).
export const GRUPO_TECIDO_ID = '76944';

/** Busca todas as páginas de um endpoint paginado do GestãoClick. */
async function buscarTodasPaginas<T>(url: string, params: Record<string, string | number>): Promise<T[]> {
  const todos: T[] = [];
  let pagina = 1;
  // Limite de segurança para não entrar em loop (máx 100 páginas = 10k registros).
  for (let i = 0; i < 100; i++) {
    const env = await gcRequest<GcEnvelope<T[]>>({
      method: 'GET',
      url,
      params: { ...params, pagina },
    });
    todos.push(...(env.data ?? []));
    const prox = env.meta?.proxima_pagina;
    if (!prox) break;
    pagina = prox;
  }
  return todos;
}

export function listarGruposProdutos(): Promise<GcGrupo[]> {
  return buscarTodasPaginas<GcGrupo>('/api/grupos_produtos', {});
}

export function listarProdutos(filtros: { grupo_id?: string; ativo?: 0 | 1 } = {}): Promise<GcProduto[]> {
  const params: Record<string, string | number> = {};
  if (filtros.grupo_id) params.grupo_id = filtros.grupo_id;
  if (filtros.ativo !== undefined) params.ativo = filtros.ativo;
  return buscarTodasPaginas<GcProduto>('/api/produtos', params);
}

export async function listarLojas(): Promise<GcLoja[]> {
  const env = await gcRequest<GcEnvelope<GcLoja[]>>({ method: 'GET', url: '/api/lojas' });
  return env.data ?? [];
}

export async function listarUsuarios(): Promise<GcUsuario[]> {
  const env = await gcRequest<GcEnvelope<GcUsuario[]>>({ method: 'GET', url: '/api/usuarios' });
  return env.data ?? [];
}

/** Funcionários (vendedores) do GestãoClick — usados para vincular ao usuário da Pérsia. */
export function listarFuncionarios(): Promise<GcFuncionario[]> {
  return buscarTodasPaginas<GcFuncionario>('/api/funcionarios', {});
}

export async function listarSituacoesOrcamentos(): Promise<GcSituacao[]> {
  const env = await gcRequest<GcEnvelope<GcSituacao[]>>({
    method: 'GET',
    url: '/api/situacoes_orcamentos',
  });
  return env.data ?? [];
}
