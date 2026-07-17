import { listarProdutos, listarProdutosRemoto, type GcProduto } from '../gc/catalogos';
import { precoByTier } from '../gc/tecidos';
import { roundHalfUp } from './arredondamento';
import { AppError } from '../../middleware/errorHandler';

export interface ProdutoCatalogoOrcamento {
  id: string;
  nome: string;
  codigo_interno: string;
  grupo_id: string;
  nome_grupo: string;
  preco_venda: number;
  valor_custo: number;
}

export interface ProdutoAvulsoEntrada {
  produto_id: string;
  quantidade: number;
  ambiente?: string;
  observacao?: string;
}

export interface TrilhoEspecialEntrada {
  produto_id: string;
  largura: number;
  quantidade: number;
  ambiente?: string;
  observacao?: string;
}

export interface ItemExtraPreparado {
  tipo: 'produto_avulso' | 'trilho_especial';
  produto_id: string;
  nome_produto: string;
  descricao_produto: string;
  quantidade: number;
  largura?: number;
  valor_unitario: number;
  valor_final: number;
  valor_custo: number;
  ambiente: string;
  observacao: string;
}

function normalizarProduto(p: GcProduto): ProdutoCatalogoOrcamento {
  const preco = precoByTier(p, 'varejo');
  return {
    id: String(p.id),
    nome: p.nome,
    codigo_interno: String(p.codigo_interno ?? ''),
    grupo_id: String(p.grupo_id ?? ''),
    nome_grupo: p.nome_grupo ?? '',
    preco_venda: preco.venda,
    valor_custo: preco.custo,
  };
}

export async function listarProdutosParaOrcamento(q = ''): Promise<ProdutoCatalogoOrcamento[]> {
  const termo = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const produtos = await listarProdutos({ ativo: 1 });
  return produtos
    .map(normalizarProduto)
    .filter((p) => {
      if (!termo) return true;
      const alvo = `${p.nome} ${p.codigo_interno} ${p.nome_grupo}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return termo.split(/\s+/).every((palavra) => alvo.includes(palavra));
    })
    .slice(0, 300);
}

async function buscarProdutoParaOrcamento(id: string): Promise<ProdutoCatalogoOrcamento> {
  const produtoId = String(id ?? '').trim();
  if (!produtoId) throw new AppError(400, 'PRODUTO_OBRIGATORIO', 'Selecione o produto.');
  const localOuRemoto = (await listarProdutos({ ativo: 1 })).find((p) => String(p.id) === produtoId)
    ?? (await listarProdutosRemoto({ ativo: 1 })).find((p) => String(p.id) === produtoId)
    ?? null;
  if (!localOuRemoto) throw new AppError(400, 'PRODUTO_INVALIDO', 'Produto do GestãoClick não encontrado.');
  return normalizarProduto(localOuRemoto);
}

function texto(v: unknown): string {
  return String(v ?? '').trim().slice(0, 120);
}

function quantidadeValida(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new AppError(400, 'QUANTIDADE_INVALIDA', 'Informe uma quantidade válida.');
  return roundHalfUp(n);
}

function medidaValida(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new AppError(400, 'MEDIDA_INVALIDA', 'Informe uma medida válida.');
  return roundHalfUp(n);
}

export async function prepararProdutosAvulsos(entradas: ProdutoAvulsoEntrada[] = []): Promise<ItemExtraPreparado[]> {
  const out: ItemExtraPreparado[] = [];
  for (const entrada of entradas) {
    const produto = await buscarProdutoParaOrcamento(entrada.produto_id);
    const quantidade = quantidadeValida(entrada.quantidade);
    const ambiente = texto(entrada.ambiente);
    const observacao = texto(entrada.observacao);
    const valorFinal = roundHalfUp(produto.preco_venda * quantidade);
    out.push({
      tipo: 'produto_avulso',
      produto_id: produto.id,
      nome_produto: produto.nome,
      descricao_produto: [
        ambiente ? `Ambiente: ${ambiente}` : null,
        `Produto avulso: ${produto.nome}`,
        `Quantidade: ${quantidade}`,
        observacao ? `Obs.: ${observacao}` : null,
      ].filter(Boolean).join('\n'),
      quantidade,
      valor_unitario: produto.preco_venda,
      valor_final: valorFinal,
      valor_custo: roundHalfUp(produto.valor_custo * quantidade),
      ambiente,
      observacao,
    });
  }
  return out;
}

export async function prepararTrilhosEspeciais(entradas: TrilhoEspecialEntrada[] = []): Promise<ItemExtraPreparado[]> {
  const out: ItemExtraPreparado[] = [];
  for (const entrada of entradas) {
    const produto = await buscarProdutoParaOrcamento(entrada.produto_id);
    const largura = medidaValida(entrada.largura);
    const quantidade = quantidadeValida(entrada.quantidade);
    const ambiente = texto(entrada.ambiente);
    const observacao = texto(entrada.observacao);
    const valorFinal = roundHalfUp(produto.preco_venda * largura * quantidade);
    out.push({
      tipo: 'trilho_especial',
      produto_id: produto.id,
      nome_produto: `Trilho especial ${produto.nome}`,
      descricao_produto: [
        ambiente ? `Ambiente: ${ambiente}` : null,
        `Produto base: ${produto.nome}`,
        `Cálculo: ${largura} m x ${quantidade} x ${produto.preco_venda}`,
        observacao ? `Obs.: ${observacao}` : null,
      ].filter(Boolean).join('\n'),
      quantidade,
      largura,
      valor_unitario: produto.preco_venda,
      valor_final: valorFinal,
      valor_custo: roundHalfUp(produto.valor_custo * largura * quantidade),
      ambiente,
      observacao,
    });
  }
  return out;
}
