import { listarProdutos, listarProdutosRemoto, type GcProduto } from '../gc/catalogos';
import { precoByTier } from '../gc/tecidos';
import { roundHalfUp } from './arredondamento';
import { AppError } from '../../middleware/errorHandler';
import { encontrarCalculadoraTrilhoEspecial, type CalculadoraTrilhoEspecial } from './calculadorasTrilhoEspecial';
import { evalQuantidade } from './formula';

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
  calculadora_id?: string;
  produto_id?: string; // legado: trilhos salvos antes da integração com as calculadoras
  largura: number;
  quantidade: number;
  emendas?: number;
  lado_motor?: 'direito' | 'esquerdo';
  tipo_abertura?: 'direita' | 'esquerda';
  ambiente?: string;
  observacao?: string;
}

export interface ItemExtraPreparado {
  tipo: 'produto_avulso' | 'trilho_especial';
  produto_id: string;
  nome_produto: string;
  descricao_produto?: string;
  quantidade: number;
  largura?: number;
  valor_unitario: number;
  valor_final: number;
  valor_custo: number;
  ambiente: string;
  observacao: string;
}

export interface ComponenteTrilhoCalculado {
  produto_id: string;
  codigo_interno: string;
  nome: string;
  formula: string;
  quantidade: number;
  preco_venda: number;
  valor_custo: number;
  subtotal: number;
  subtotal_custo: number;
}

export interface CalculoTrilhoEspecial {
  calculadora_id: string;
  nome: string;
  largura: number;
  quantidade: number;
  emendas: number;
  motorizado: boolean;
  componentes: ComponenteTrilhoCalculado[];
  valor_unitario: number;
  valor_total: number;
  custo_total: number;
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
  // A sincronização local contém o catálogo completo. A consulta remota fica
  // apenas como contingência quando a base local ainda não foi inicializada.
  const produtos = await listarProdutos({ ativo: 1 });
  return produtos
    .map(normalizarProduto)
    .filter((p) => {
      if (!termo) return true;
      const alvo = `${p.nome} ${p.codigo_interno} ${p.nome_grupo}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return termo.split(/\s+/).every((palavra) => alvo.includes(palavra));
    });
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

export function calcularComposicaoTrilho(
  calculadora: CalculadoraTrilhoEspecial,
  largura: number,
  quantidade: number,
  emendas: number,
  produtos: ProdutoCatalogoOrcamento[],
): CalculoTrilhoEspecial {
  const porCodigo = new Map(produtos.map((p) => [p.codigo_interno.trim().toLowerCase(), p]));
  const componentes = calculadora.componentes.map((componente) => {
    const codigo = componente.codigo_interno.trim();
    const produto = porCodigo.get(codigo.toLowerCase());
    if (!produto) {
      throw new AppError(400, 'COMPONENTE_NAO_ENCONTRADO', `O produto de código "${codigo}" da calculadora "${calculadora.nome}" não foi encontrado no catálogo local.`);
    }
    let quantidadeFormula: number;
    try {
      quantidadeFormula = roundHalfUp(evalQuantidade(componente.qtd, { largura, altura: 0, tc: 0, emendas }), 4);
    } catch (e) {
      throw new AppError(400, 'FORMULA_TRILHO_INVALIDA', e instanceof Error ? e.message : `Fórmula inválida em "${componente.descricao}".`);
    }
    if (!Number.isFinite(quantidadeFormula) || quantidadeFormula < 0) {
      throw new AppError(400, 'QUANTIDADE_TRILHO_INVALIDA', `A fórmula de "${componente.descricao}" resultou em uma quantidade inválida.`);
    }
    const quantidadeTotal = roundHalfUp(quantidadeFormula * quantidade, 4);
    return {
      produto_id: produto.id,
      codigo_interno: produto.codigo_interno,
      nome: produto.nome,
      formula: componente.qtd,
      quantidade: quantidadeTotal,
      preco_venda: produto.preco_venda,
      valor_custo: produto.valor_custo,
      subtotal: roundHalfUp(produto.preco_venda * quantidadeTotal),
      subtotal_custo: roundHalfUp(produto.valor_custo * quantidadeTotal),
    };
  });
  const valorTotal = roundHalfUp(componentes.reduce((s, c) => s + c.subtotal, 0));
  return {
    calculadora_id: calculadora.id,
    nome: calculadora.nome,
    largura,
    quantidade,
    emendas,
    motorizado: calculadora.motorizado === true,
    componentes,
    valor_unitario: roundHalfUp(valorTotal / quantidade),
    valor_total: valorTotal,
    custo_total: roundHalfUp(componentes.reduce((s, c) => s + c.subtotal_custo, 0)),
  };
}

export async function calcularTrilhoEspecial(calculadoraId: string, larguraEntrada: unknown, quantidadeEntrada: unknown, emendasEntrada: unknown = 0): Promise<CalculoTrilhoEspecial> {
  const calculadora = encontrarCalculadoraTrilhoEspecial(String(calculadoraId ?? '').trim());
  if (!calculadora) throw new AppError(400, 'CALCULADORA_TRILHO_INVALIDA', 'Selecione uma calculadora de trilho especial válida.');
  const largura = medidaValida(larguraEntrada);
  const quantidade = quantidadeValida(quantidadeEntrada);
  const emendas = emendasValida(emendasEntrada);
  const produtos = (await listarProdutos({ ativo: 1 })).map(normalizarProduto);
  return calcularComposicaoTrilho(calculadora, largura, quantidade, emendas, produtos);
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

function emendasValida(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new AppError(400, 'EMENDAS_INVALIDAS', 'Informe uma quantidade de emendas igual ou maior que zero.');
  return n;
}

function ladoMotor(v: unknown): 'direito' | 'esquerdo' {
  return v === 'esquerdo' ? 'esquerdo' : 'direito';
}

function tipoAbertura(v: unknown): 'direita' | 'esquerda' {
  return v === 'esquerda' ? 'esquerda' : 'direita';
}

export async function prepararProdutosAvulsos(entradas: ProdutoAvulsoEntrada[] = []): Promise<ItemExtraPreparado[]> {
  const out: ItemExtraPreparado[] = [];
  for (const entrada of entradas) {
    const produto = await buscarProdutoParaOrcamento(entrada.produto_id ?? '');
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
    if (entrada.calculadora_id) {
      const calculo = await calcularTrilhoEspecial(entrada.calculadora_id, entrada.largura, entrada.quantidade, entrada.emendas ?? 0);
      const ambiente = texto(entrada.ambiente);
      const observacao = texto(entrada.observacao);
      const lado = ladoMotor(entrada.lado_motor);
      const abertura = tipoAbertura(entrada.tipo_abertura);
      out.push({
        tipo: 'trilho_especial',
        produto_id: '',
        nome_produto: `Trilho especial ${calculo.nome}`,
        // Para trilhos motorizados o produto sintético do GestãoClick precisa
        // apenas do nome. Os demais mantêm a ficha técnica para produção.
        descricao_produto: calculo.motorizado ? undefined : [
          ambiente ? `Ambiente: ${ambiente}` : null,
          `Modelo: ${calculo.nome}`,
          `Largura: ${calculo.largura} m | Quantidade: ${calculo.quantidade} | Emendas por trilho: ${calculo.emendas}`,
          `Lado do motor: ${lado} | Tipo de abertura: ${abertura}`,
          ...calculo.componentes.map((c) => `${c.nome} (${c.codigo_interno}): ${c.quantidade} x ${c.preco_venda}`),
          observacao ? `Obs.: ${observacao}` : null,
        ].filter(Boolean).join('\n'),
        quantidade: calculo.quantidade,
        largura: calculo.largura,
        valor_unitario: calculo.valor_unitario,
        valor_final: calculo.valor_total,
        valor_custo: calculo.custo_total,
        ambiente,
        observacao,
      });
      continue;
    }
    const produto = await buscarProdutoParaOrcamento(entrada.produto_id ?? '');
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
