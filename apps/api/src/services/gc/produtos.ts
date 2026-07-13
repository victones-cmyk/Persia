// apps/api/src/services/gc/produtos.ts
// Escrita de produtos no GestãoClick (SRD §11, Fase 5).
// Cada orçamento cria um produto que representa a persiana configurada, com o
// valor já calculado. codigo_interno precisa ser único por produto sintético.

import { GcError, gcRequest, type GcEnvelope } from './client';

// Tier de preço dos produtos de persiana criados: VAREJO (regra Victor 11/06/2026).
import { VAREJO_TIPO_ID } from './tecidos';

export interface NovoProdutoGc {
  nome: string;
  descricao?: string;
  valor_custo: number;
  valor_venda: number;
}

interface ProdutoCriado {
  id: string;
}

export interface ResultadoProduto {
  gc_produto_id: string;
  codigo_interno: string;
  payload: Record<string, unknown>;
  criado: boolean;
}

let sequenciaProduto = 0;
const LIMITE_NOME_PRODUTO = 120;

function novoCodigoInterno(): string {
  sequenciaProduto = (sequenciaProduto + 1) % 1000;
  return `${Date.now()}${sequenciaProduto.toString().padStart(3, '0')}`;
}

export function nomeProdutoGc(nome: string): string {
  const base = nome.trim() || 'Produto Pérsia';
  return base.slice(0, LIMITE_NOME_PRODUTO).trim();
}

function descricaoProdutoGc(descricao: string | undefined): string | undefined {
  const limpa = descricao
    ?.replace(/\r?\n+/g, ' | ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpa || undefined;
}

export function urlProdutoUnica(codigoInterno: string): string {
  return codigoInterno;
}

function erroUrlProdutoDuplicada(err: unknown): boolean {
  if (!(err instanceof GcError)) return false;
  const texto = `${err.message} ${JSON.stringify(err.payload ?? '')}`.toLocaleLowerCase('pt-BR');
  return texto.includes('url do produto') && texto.includes('utilizada');
}

export async function criarProduto(p: NovoProdutoGc): Promise<ResultadoProduto> {
  const nome = nomeProdutoGc(p.nome);
  const descricao = descricaoProdutoGc(p.descricao);

  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const codigo_interno = novoCodigoInterno();
    const payload = {
      nome,
      ...(descricao ? { descricao } : {}),
      url: urlProdutoUnica(codigo_interno),
      codigo_interno,
      valor_custo: p.valor_custo,
      movimenta_estoque: 0, // produto sintético do orçamento — não controla estoque
      valores: [{ tipo_id: VAREJO_TIPO_ID, valor_venda: p.valor_venda }],
    };

    try {
      const env = await gcRequest<GcEnvelope<ProdutoCriado>>({
        method: 'POST',
        url: '/api/produtos',
        data: payload,
      });

      const gc_produto_id = env.data?.id;
      if (!gc_produto_id) {
        throw new Error('GestãoClick não retornou o id do produto.');
      }
      return { gc_produto_id, codigo_interno, payload, criado: true };
    } catch (err) {
      if (!erroUrlProdutoDuplicada(err) || tentativa === 2) throw err;
    }
  }

  throw new Error('Não foi possível criar o produto no GestãoClick.');
}

export async function deletarProduto(id: string): Promise<void> {
  await gcRequest({ method: 'DELETE', url: `/api/produtos/${encodeURIComponent(id)}` });
}
