// apps/api/src/services/calc/persianaPreco.ts
// Preço da persiana pelo modelo do Victor (v.5.1): valor = soma de TODOS os componentes
// + tecido, tudo a VAREJO (sem markup). Cada componente: quantidade pela fórmula da
// receita × preço do GestãoClick (pelo codigo_interno). Tecido: fórmula da família.
// Função PURA (preços injetados) para ser testável sem o GestãoClick.

import { evalQuantidade, type VarsQtd } from './formula';
import { roundHalfUp } from './arredondamento';
import { RECEITAS_PERSIANA, type VariantePersiana } from './persianaReceitas.data';
import { encontrarCalculadora, type FamiliaPersiana } from './calculadoras';
import type { TipoPersiana, Acionamento, Cor } from './tipos';

/** Família (receita) a partir do tipo de persiana. */
export function familiaDoTipo(tipo: TipoPersiana): FamiliaPersiana {
  const calc = encontrarCalculadora(tipo);
  if (calc) return calc.familia;

  if (tipo === 'persiana_rolo_double_vision') return 'double_vision';
  if (tipo === 'persiana_rolo_screen') return 'tela_solar';
  if (tipo === 'persiana_romana_screen') return 'romana_tela_solar';
  if (tipo.startsWith('persiana_romana')) return 'romana'; // blackout + translúcido
  return 'rolo_bk_translucido'; // blackout + translúcido (mesma receita)
}

/** Famílias que usam a lógica de cavaletes/hastes (romana e romana tela solar). */
function ehFamiliaRomana(f: FamiliaPersiana): boolean {
  return f === 'romana' || f === 'romana_tela_solar';
}

/** Variante (manual/motor × com/sem bandô) a partir do acionamento. */
export function varianteDoAcionamento(ac: Acionamento): VariantePersiana {
  switch (ac) {
    case 'com_bando': return 'com_bando';
    case 'motorizado_com_bando': return 'motor_com_bando';
    case 'motorizado_sem_bando': return 'motor_sem_bando';
    default: return 'sem_bando'; // com_barra
  }
}

export function ehAcionamentoMotorizado(ac: Acionamento): boolean {
  return ac === 'motorizado_com_bando' || ac === 'motorizado_sem_bando';
}

/** Romana: nº de cavaletes = arredonda-pra-cima(LARGURA / 0,5) (ROUNDUP da planilha). */
export function cavaletesRomana(largura: number): number {
  return Math.ceil(largura / 0.5);
}

/** Romana: nº de hastes por faixa de altura (IFS da planilha v.2; máx 5,80m). */
export function hastesRomana(altura: number): number {
  if (altura <= 1) return 2;
  if (altura <= 1.8) return 4;
  if (altura <= 2.6) return 6;
  if (altura <= 3.4) return 8;
  if (altura <= 4.2) return 10;
  if (altura <= 5) return 12;
  if (altura <= 5.8) return 14;
  throw new ReceitaPendenteError('Altura acima do limite da persiana romana (máx 5,80m).');
}

/** Receita ainda não cadastrada (romana ou motorizado, aguardando Victor). */
export class ReceitaPendenteError extends Error {
  code = 'RECEITA_PERSIANA_PENDENTE';
  constructor(msg: string) {
    super(msg);
    this.name = 'ReceitaPendenteError';
  }
}

export interface LinhaCustoPersiana {
  codigo_interno: string;
  descricao: string;
  quantidade: number;
  preco: number;
  subtotal: number;
  /** ID do produto no GestãoClick (chave do PUT /produtos/{id} — saída de estoque).
   * null quando o componente não foi encontrado no catálogo do GC. */
  produto_id?: string | null;
}
export interface ComponentePrecoLookup {
  id: string;
  codigo_interno: string;
  nome: string;
  preco: number;
}
export interface ResultadoPrecoPersiana {
  familia: FamiliaPersiana;
  variante: VariantePersiana;
  itens: LinhaCustoPersiana[];
  tecido: LinhaCustoPersiana;
  valor: number; // soma de tudo, a VAREJO
}
export interface LinhaAuditoriaPersiana extends LinhaCustoPersiana {
  descricao_original: string;
  descricao_alvo: string;
  codigo_original: string;
  origem: 'original' | 'cor' | 'fallback';
  alerta?: string;
}
export interface ResultadoAuditoriaPersiana extends ResultadoPrecoPersiana {
  itens: LinhaAuditoriaPersiana[];
  variaveis: VarsQtd;
}

export interface EntradaPrecoPersiana {
  tipo: TipoPersiana;
  acionamento: Acionamento;
  largura: number;
  altura: number;
  tc: number;
  preco_tecido: number; // R$ por unidade conforme a fórmula da família (altura ou m²)
  precos: Map<string, number>; // codigo_interno → preço VAREJO do componente
  componentesPorNome?: Map<string, ComponentePrecoLookup>;
  /** codigo_interno → ID do produto no GestãoClick — fallback quando o componente
   * não passa pelo casamento por nome (ex.: bandô/emissor escolhidos pelo vendedor,
   * ou o componente original da receita sem troca de cor). */
  produtoIds?: Map<string, string>;
  componente_bando?: { codigo_interno: string; descricao: string } | null;
  cor_acessorio?: Cor | null;
  cor_base?: Cor | null;
  /** EMISSOR (RF, rolô/double vision/tela solar motorizados): opcional, Sim/Não por item.
   * Diferente do bandô, NÃO faz parte da receita — é uma linha extra somada só quando
   * o vendedor escolhe "Emissor: Sim" e um produto do grupo EMISSOR (6006913, Victor 01/08/2026). */
  emissor?: boolean;
  componente_emissor?: { codigo_interno: string; descricao: string } | null;
}

const COR_UPPER: Record<Cor, string> = {
  Branco: 'BRANCO',
  Bege: 'BEGE',
  Cinza: 'CINZA',
  Preto: 'PRETO',
};

function chaveNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function ehComponenteBase(descricao: string): boolean {
  return /\b(?:BASE|TAMPA DA BASE|EIXO DOUBLE VISION)\b/i.test(descricao);
}

function trocarCorDescricao(descricao: string, cor: Cor | null | undefined): string {
  if (!cor) return descricao;
  const alvo = COR_UPPER[cor];
  return descricao
    .replace(/\bCOR\s+(?:BRANCO|BEGE|CINZA|PRETO)\b/gi, `COR ${alvo}`)
    .replace(/\b(?:BRANCO|BEGE|CINZA|PRETO)\b(?=\s*$)/gi, alvo);
}

function resolverComponenteColoridoDetalhado(
  componente: { codigo_interno: string; descricao: string },
  e: EntradaPrecoPersiana,
): { codigo_interno: string; descricao: string; preco: number; produto_id: string | null; descricao_original: string; descricao_alvo: string; codigo_original: string; origem: 'original' | 'cor' | 'fallback'; alerta?: string } {
  if (e.componente_bando && /\bBANDO\b/i.test(componente.descricao)) {
    return {
      codigo_interno: e.componente_bando.codigo_interno,
      descricao: e.componente_bando.descricao,
      preco: e.precos.get(e.componente_bando.codigo_interno) ?? 0,
      produto_id: e.produtoIds?.get(e.componente_bando.codigo_interno) ?? null,
      descricao_original: componente.descricao,
      descricao_alvo: e.componente_bando.descricao,
      codigo_original: componente.codigo_interno,
      origem: 'original',
    };
  }
  const cor = ehComponenteBase(componente.descricao) ? e.cor_base : e.cor_acessorio;
  const descricaoAlvo = trocarCorDescricao(componente.descricao, cor);
  const mudouCor = descricaoAlvo !== componente.descricao;
  const encontrado = e.componentesPorNome?.get(chaveNome(descricaoAlvo));
  if (encontrado) {
    return {
      codigo_interno: encontrado.codigo_interno,
      descricao: encontrado.nome,
      preco: encontrado.preco,
      produto_id: encontrado.id,
      descricao_original: componente.descricao,
      descricao_alvo: descricaoAlvo,
      codigo_original: componente.codigo_interno,
      origem: mudouCor ? 'cor' : 'original',
    };
  }
  const alerta = mudouCor ? `${descricaoAlvo} não encontrado no GestãoClick. Usando o componente original.` : undefined;
  return {
    codigo_interno: componente.codigo_interno,
    descricao: componente.descricao,
    preco: e.precos.get(componente.codigo_interno) ?? 0,
    produto_id: e.produtoIds?.get(componente.codigo_interno) ?? null,
    descricao_original: componente.descricao,
    descricao_alvo: descricaoAlvo,
    codigo_original: componente.codigo_interno,
    origem: mudouCor ? 'fallback' : 'original',
    alerta,
  };
}

function resolverComponenteColorido(
  componente: { codigo_interno: string; descricao: string },
  e: EntradaPrecoPersiana,
): { codigo_interno: string; descricao: string; preco: number; produto_id: string | null } {
  const r = resolverComponenteColoridoDetalhado(componente, e);
  return { codigo_interno: r.codigo_interno, descricao: r.descricao, preco: r.preco, produto_id: r.produto_id };
}

function variaveisDaFamilia(familia: FamiliaPersiana, largura: number, altura: number, tc: number): VarsQtd {
  const vars: VarsQtd = { largura, altura, tc };
  if (ehFamiliaRomana(familia)) {
    vars.cavaletes = cavaletesRomana(largura);
    vars.hastes = hastesRomana(altura);
  }
  return vars;
}

export function calcularPrecoPersiana(e: EntradaPrecoPersiana): ResultadoPrecoPersiana {
  const calc = encontrarCalculadora(e.tipo);
  const familia = calc ? calc.familia : familiaDoTipo(e.tipo);
  const variante = varianteDoAcionamento(e.acionamento);

  const receita = calc ? calc.receitas[variante] : RECEITAS_PERSIANA[familia]?.[variante];
  if (!receita) {
    // Pendentes: tela_solar motorizada e romana motorizada (esta não existe — Victor).
    const msg = ehAcionamentoMotorizado(e.acionamento)
      ? `A persiana motorizada de ${familia} ainda não foi cadastrada.`
      : `Receita não encontrada: ${familia}/${variante}.`;
    throw new ReceitaPendenteError(msg);
  }

  const vars = variaveisDaFamilia(familia, e.largura, e.altura, e.tc);
  let total = 0;
  const itens: LinhaCustoPersiana[] = receita.componentes.map((c) => {
    const q = evalQuantidade(c.qtd, vars);
    const componente = resolverComponenteColorido(c, e);
    const preco = componente.preco;
    total += q * preco;
    return { codigo_interno: componente.codigo_interno, descricao: componente.descricao, quantidade: roundHalfUp(q, 4), preco, subtotal: roundHalfUp(q * preco), produto_id: componente.produto_id };
  });

  if (e.emissor && e.componente_emissor) {
    const preco = e.precos.get(e.componente_emissor.codigo_interno) ?? 0;
    total += preco;
    itens.push({
      codigo_interno: e.componente_emissor.codigo_interno,
      descricao: e.componente_emissor.descricao,
      quantidade: 1,
      preco,
      subtotal: roundHalfUp(preco),
      produto_id: e.produtoIds?.get(e.componente_emissor.codigo_interno) ?? null,
    });
  }

  const qTec = evalQuantidade(receita.tecido_qtd, vars);
  total += qTec * e.preco_tecido;
  const tecido: LinhaCustoPersiana = {
    codigo_interno: '',
    descricao: 'TECIDO',
    quantidade: roundHalfUp(qTec, 4),
    preco: e.preco_tecido,
    subtotal: roundHalfUp(qTec * e.preco_tecido),
  };

  return { familia, variante, itens, tecido, valor: roundHalfUp(total) };
}

export function auditarPrecoPersiana(e: EntradaPrecoPersiana & {
  familia: FamiliaPersiana;
  variante: VariantePersiana;
  receita: { componentes: { codigo_interno: string; descricao: string; qtd: string }[]; tecido_qtd: string };
}): ResultadoAuditoriaPersiana {
  const vars = variaveisDaFamilia(e.familia, e.largura, e.altura, e.tc);
  let total = 0;
  const itens: LinhaAuditoriaPersiana[] = e.receita.componentes.map((c) => {
    const q = evalQuantidade(c.qtd, vars);
    const componente = resolverComponenteColoridoDetalhado(c, e);
    const preco = componente.preco;
    const subtotal = roundHalfUp(q * preco);
    total += q * preco;
    return {
      codigo_interno: componente.codigo_interno,
      descricao: componente.descricao,
      quantidade: roundHalfUp(q, 4),
      preco,
      subtotal,
      produto_id: componente.produto_id,
      descricao_original: componente.descricao_original,
      descricao_alvo: componente.descricao_alvo,
      codigo_original: componente.codigo_original,
      origem: componente.origem,
      alerta: componente.alerta,
    };
  });

  const qTec = evalQuantidade(e.receita.tecido_qtd, vars);
  total += qTec * e.preco_tecido;
  const tecido: LinhaCustoPersiana = {
    codigo_interno: '',
    descricao: 'TECIDO',
    quantidade: roundHalfUp(qTec, 4),
    preco: e.preco_tecido,
    subtotal: roundHalfUp(qTec * e.preco_tecido),
  };

  return { familia: e.familia, variante: e.variante, itens, tecido, valor: roundHalfUp(total), variaveis: vars };
}
