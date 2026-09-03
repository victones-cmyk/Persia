import { listarProdutos, listarProdutosRemoto, type GcProduto } from '../gc/catalogos';
import { precoByTier } from '../gc/tecidos';
import { ajustarTotalParaQuantidade, roundHalfUp } from './arredondamento';
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
  variante_id?: string;
  produto_id?: string; // legado: trilhos salvos antes da integração com as calculadoras
  largura: number;
  /** Só para calculadoras layout='trilho_deslizante': TC = 75% da altura. */
  altura?: number;
  quantidade: number;
  emendas?: number;
  tc?: number;
  /** Componente (por id) -> produto do GestãoClick escolhido pelo vendedor,
   * para componentes de "modo grupo" (ver ComponenteCalculadoraTrilho.grupo_id). */
  selecoes_componentes?: Record<string, string>;
  lado_motor?: 'direito' | 'esquerdo';
  tipo_abertura?: 'direita' | 'esquerda';
  ambiente?: string;
  observacao?: string;
}

export interface ComponenteExtraSnapshot {
  descricao: string;
  quantidade: number;
  unidade?: string;
  produto_id?: string | null;
}

export interface ItemExtraPreparado {
  tipo: 'produto_avulso' | 'trilho_especial';
  produto_id: string;
  nome_produto: string;
  descricao_produto?: string;
  quantidade: number;
  largura?: number;
  altura?: number;
  emendas?: number;
  tc?: number;
  motorizado?: boolean;
  lado_motor?: 'direito' | 'esquerdo';
  tipo_abertura?: 'direita' | 'esquerda';
  componentes?: ComponenteExtraSnapshot[];
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
  variante_id: string;
  variante_nome: string;
  nome: string;
  largura: number;
  quantidade: number;
  emendas: number;
  tc: number;
  motorizado: boolean;
  layout: 'padrao' | 'trilho_deslizante';
  componentes: ComponenteTrilhoCalculado[];
  valor_unitario: number;
  valor_total: number;
  custo_total: number;
}

/** Entrada já validada/tipada para calcularComposicaoTrilho (ver calcularTrilhoEspecial). */
export interface EntradaCalculoTrilho {
  varianteId?: string;
  largura: number;
  /** Só usada por fórmulas que referenciam ALTURA (ex.: calculadoras layout='trilho_deslizante'). */
  altura?: number;
  quantidade: number;
  emendas: number;
  tc: number;
  selecoesComponentes?: Record<string, string>;
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
  entrada: EntradaCalculoTrilho,
  produtos: ProdutoCatalogoOrcamento[],
): CalculoTrilhoEspecial {
  const { varianteId, largura, altura, quantidade, emendas, tc, selecoesComponentes } = entrada;
  const variantes = calculadora.variantes ?? [];
  // Sem variante_id (orçamentos salvos antes desta feature): assume a primeira
  // variante. Com variante_id preenchido que não corresponde a nenhuma variante
  // atual (removida/renomeada, ou id adulterado), falha em vez de recalcular
  // silenciosamente com uma composição/preço diferentes do que foi selecionado.
  const variante = varianteId ? variantes.find((v) => v.id === varianteId) : variantes[0];
  if (!variante) throw new AppError(400, 'VARIANTE_TRILHO_INVALIDA', 'Selecione uma variante válida do trilho especial.');
  const porCodigo = new Map(produtos.map((p) => [p.codigo_interno.trim().toLowerCase(), p]));
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const componentes = variante.componentes.map((componente) => {
    const grupoId = componente.grupo_id?.trim();
    let produto: ProdutoCatalogoOrcamento | undefined;
    if (grupoId) {
      const produtoId = String(selecoesComponentes?.[componente.id] ?? '').trim();
      if (!produtoId) {
        throw new AppError(400, 'COMPONENTE_SEM_SELECAO', `Selecione o produto de "${componente.descricao}".`);
      }
      produto = porId.get(produtoId);
      if (!produto || produto.grupo_id !== grupoId) {
        throw new AppError(400, 'COMPONENTE_INVALIDO', `O produto selecionado para "${componente.descricao}" não pertence ao grupo esperado.`);
      }
    } else {
      const codigo = componente.codigo_interno.trim();
      produto = porCodigo.get(codigo.toLowerCase());
      if (!produto) {
        throw new AppError(400, 'COMPONENTE_NAO_ENCONTRADO', `O produto de código "${codigo}" da calculadora "${calculadora.nome}" não foi encontrado no catálogo local.`);
      }
    }
    let quantidadeFormula: number;
    try {
      quantidadeFormula = roundHalfUp(evalQuantidade(componente.qtd, { largura, altura: altura ?? 0, tc, emendas }), 4);
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
    variante_id: variante.id,
    variante_nome: variante.nome,
    nome: calculadora.nome,
    largura,
    quantidade,
    emendas,
    tc,
    motorizado: variante.motorizado === true,
    layout: calculadora.layout === 'trilho_deslizante' ? 'trilho_deslizante' : 'padrao',
    componentes,
    valor_unitario: roundHalfUp(valorTotal / quantidade),
    valor_total: valorTotal,
    custo_total: roundHalfUp(componentes.reduce((s, c) => s + c.subtotal_custo, 0)),
  };
}

export async function calcularTrilhoEspecial(entrada: {
  calculadoraId: unknown;
  varianteId?: string;
  largura: unknown;
  altura?: unknown;
  quantidade: unknown;
  emendas?: unknown;
  tc?: unknown;
  selecoesComponentes?: Record<string, string>;
}): Promise<CalculoTrilhoEspecial> {
  const calculadora = encontrarCalculadoraTrilhoEspecial(String(entrada.calculadoraId ?? '').trim());
  if (!calculadora) throw new AppError(400, 'CALCULADORA_TRILHO_INVALIDA', 'Selecione uma calculadora de trilho especial válida.');
  const largura = medidaValida(entrada.largura);
  const altura = entrada.altura !== undefined ? alturaValida(entrada.altura) : undefined;
  const quantidade = quantidadeValida(entrada.quantidade);
  const emendas = emendasValida(entrada.emendas ?? 0);
  const tc = tcValido(entrada.tc ?? 0);
  const produtos = (await listarProdutos({ ativo: 1 })).map(normalizarProduto);
  return calcularComposicaoTrilho(calculadora, { varianteId: entrada.varianteId, largura, altura, quantidade, emendas, tc, selecoesComponentes: entrada.selecoesComponentes }, produtos);
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

// Altura é opcional a nível de backend (só calculadoras layout='trilho_deslizante'
// a exigem) — quem obriga o preenchimento é o formulário do vendedor, igual ao TC.
function alturaValida(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new AppError(400, 'ALTURA_INVALIDA', 'Informe uma altura válida.');
  return roundHalfUp(n);
}

function emendasValida(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new AppError(400, 'EMENDAS_INVALIDAS', 'Informe uma quantidade de emendas igual ou maior que zero.');
  return n;
}

// TC é opcional a nível de backend (nem toda fórmula usa a variável TC) — quem
// exige o preenchimento é o formulário do vendedor, condicionalmente à fórmula.
function tcValido(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new AppError(400, 'TC_INVALIDO', 'Informe um TC válido.');
  return roundHalfUp(n);
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
    // valor_final/valor_custo precisam ser múltiplos exatos de um preço unitário de
    // 2 casas decimais: o GC reconstrói o total como quantidade × valor_venda (RN-10),
    // e o preço do catálogo pode ter mais casas decimais que isso (markup/tier).
    const valorFinal = ajustarTotalParaQuantidade(produto.preco_venda * quantidade, quantidade);
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
      valor_custo: ajustarTotalParaQuantidade(produto.valor_custo * quantidade, quantidade),
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
      const calculo = await calcularTrilhoEspecial({
        calculadoraId: entrada.calculadora_id,
        varianteId: entrada.variante_id,
        largura: entrada.largura,
        altura: entrada.altura,
        quantidade: entrada.quantidade,
        emendas: entrada.emendas ?? 0,
        tc: entrada.tc,
        selecoesComponentes: entrada.selecoes_componentes,
      });
      const deslizante = calculo.layout === 'trilho_deslizante';
      // Layout 'trilho_deslizante': o vendedor informa Altura em vez de TC — TC vem
      // calculado (75% da altura) do próprio formulário. Exige altura aqui de novo
      // (não confia no cálculo do TC feito no cliente).
      const altura = deslizante ? alturaValida(entrada.altura) : undefined;
      const ambiente = texto(entrada.ambiente);
      const observacao = texto(entrada.observacao);
      const lado = ladoMotor(entrada.lado_motor);
      const abertura = tipoAbertura(entrada.tipo_abertura);
      out.push({
        tipo: 'trilho_especial',
        produto_id: '',
        nome_produto: `${calculo.nome} — ${calculo.variante_nome}`,
        // Lado do motor/comando: sempre nos trilhos deslizantes (não tem "motorizado"
        // no sentido elétrico); nos demais, só quando a variante É motorizada, como
        // sempre foi. Abertura não existe nos deslizantes. TC só quando a fórmula da
        // calculadora realmente o usa (> 0).
        descricao_produto: [
          ambiente ? `Ambiente: ${ambiente}` : null,
          `Largura: ${calculo.largura} m`,
          deslizante ? `Altura: ${altura} m` : null,
          `Emendas: ${calculo.emendas}`,
          `Quantidade: ${calculo.quantidade}`,
          deslizante ? `Lado do comando: ${lado}` : calculo.motorizado ? `Lado do motor: ${lado}` : null,
          !deslizante && calculo.motorizado ? `Abertura: ${abertura}` : null,
          calculo.tc > 0 ? `TC: ${calculo.tc} m` : null,
          observacao ? `Obs.: ${observacao}` : null,
        ].filter(Boolean).join('\n'),
        quantidade: calculo.quantidade,
        largura: calculo.largura,
        altura,
        emendas: calculo.emendas,
        tc: calculo.tc,
        motorizado: calculo.motorizado,
        lado_motor: (deslizante || calculo.motorizado) ? lado : undefined,
        tipo_abertura: (!deslizante && calculo.motorizado) ? abertura : undefined,
        componentes: calculo.componentes.map((c) => ({
          descricao: `${c.nome} (${c.codigo_interno})`,
          quantidade: c.quantidade,
          unidade: 'un',
          produto_id: c.produto_id,
        })),
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
      nome_produto: produto.nome,
      descricao_produto: [
        ambiente ? `Ambiente: ${ambiente}` : null,
        `Produto base: ${produto.nome}`,
        `Cálculo: ${largura} m x ${quantidade} x ${produto.preco_venda}`,
        observacao ? `Obs.: ${observacao}` : null,
      ].filter(Boolean).join('\n'),
      quantidade,
      largura,
      componentes: [{ descricao: produto.nome, quantidade: roundHalfUp(largura * quantidade, 4), unidade: 'm', produto_id: produto.id }],
      valor_unitario: produto.preco_venda,
      valor_final: valorFinal,
      valor_custo: roundHalfUp(produto.valor_custo * largura * quantidade),
      ambiente,
      observacao,
    });
  }
  return out;
}
