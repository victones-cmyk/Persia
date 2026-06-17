// apps/api/src/services/calc/persiana.ts
// Motor de cálculo de persiana — 7 tipos (RN-01, RN-02, RN-03, RN-04, RN-07).

import { roundHalfUp } from './arredondamento';
import { META, TC_FATOR, type TipoPersiana, type Cor, type Acionamento, type Familia } from './tipos';
import { todosComponentes } from './componentes';
import type { ComponenteCalculado } from './componentes.types';

export class RN01Error extends Error {
  code = 'RN01_LARGURA_EXCEDIDA';
  constructor(
    public largura: number,
    public dimensao: number,
  ) {
    super(`RN01_LARGURA_EXCEDIDA: largura ${largura}m excede a dimensão do tecido ${dimensao}m`);
    this.name = 'RN01Error';
  }
}

export interface EntradaPersiana {
  tipo: TipoPersiana;
  largura: number; // metros
  altura: number; // metros
  dimensao: number; // largura do rolo do tecido (m)
  cor_acessorio: Cor;
  acionamento: Acionamento;
  /** TC opcional: se ausente, calcula 75% da altura (RN-04). Campo editável. */
  tc?: number;
  /** Preço de venda do tecido (R$/m²). Opcional: sem ele, valor_bruto = null. */
  preco_tecido?: number;
}

export interface ResultadoPersiana {
  tipo: TipoPersiana;
  codigo_gc: string;
  familia: Familia;
  largura: number;
  altura: number;
  dimensao: number;
  altura_efetiva: number; // altura (×2 no Double Vision)
  margem: number;
  tc: number;
  qtd_producao: number; // m²
  qtd_venda: number; // m²
  preco_tecido: number | null;
  valor_bruto: number | null; // RN-03: qtd_venda × preço tecido
  componentes: ComponenteCalculado[];
}

export function calcularPersiana(e: EntradaPersiana): ResultadoPersiana {
  const meta = META[e.tipo];
  if (!meta) throw new Error(`Tipo de persiana inválido: ${e.tipo}`);

  if (!(e.largura > 0) || !(e.altura > 0) || !(e.dimensao > 0)) {
    throw new Error('Largura, altura e dimensão devem ser positivos.');
  }

  // RN-01: largura solicitada não pode exceder a largura do rolo do tecido.
  if (e.largura > e.dimensao) {
    throw new RN01Error(e.largura, e.dimensao);
  }

  const alturaEfetiva = meta.dobrarAltura ? e.altura * 2 : e.altura;
  const fatorAltura = alturaEfetiva + meta.margem;

  // RN-02 — Produção sempre usa [Largura]; Venda usa [Dimensao] ou [Largura] × fator.
  const qtd_producao = roundHalfUp(e.largura * fatorAltura);
  const baseVenda = meta.baseVenda === 'dimensao' ? e.dimensao : e.largura;
  const qtd_venda = roundHalfUp(baseVenda * fatorAltura * meta.fatorVenda);

  // RN-04 — TC padrão = 75% da altura; campo editável (usa valor informado se houver).
  const tc = e.tc !== undefined ? roundHalfUp(e.tc) : roundHalfUp(e.altura * TC_FATOR);

  // RN-03 — Valor Bruto = Qtd Venda (m²) × Preço de Venda do Tecido (R$/m²).
  const preco_tecido = e.preco_tecido ?? null;
  const valor_bruto = preco_tecido !== null ? roundHalfUp(qtd_venda * preco_tecido) : null;

  const componentes = todosComponentes(e.tipo, e.cor_acessorio, e.acionamento, e.largura, e.altura);

  return {
    tipo: e.tipo,
    codigo_gc: meta.codigoGc,
    familia: meta.familia,
    largura: e.largura,
    altura: e.altura,
    dimensao: e.dimensao,
    altura_efetiva: alturaEfetiva,
    margem: meta.margem,
    tc,
    qtd_producao,
    qtd_venda,
    preco_tecido,
    valor_bruto,
    componentes,
  };
}

/** Valor final após desconto (RN-03 / RN-10). */
export function aplicarDesconto(valorBruto: number, descontoPct: number): number {
  return roundHalfUp(valorBruto * (1 - descontoPct / 100));
}
