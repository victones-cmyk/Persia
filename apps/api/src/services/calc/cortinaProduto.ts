// Formatação do produto sintético de cortina criado no GestãoClick.

import { ehVariantePrega, type FixacaoCortina, type ModeloCamadaEntrada, type ModeloCortina } from './cortina';
import { MODELOS_CORTINA_LABEL, MODELOS_PREGA_VARIANTE_LABEL } from './cortinaLabels';

type CamadaProdutoCortina = {
  nome?: string | null;
  modelo?: ModeloCamadaEntrada | null;
  tecido_nome: string;
  franzido?: number | string | null;
};

const FIXACAO_LABEL: Record<FixacaoCortina, string> = {
  varao: 'Varão',
  trilho: 'Trilho',
  varao_suico: 'Varão suíço',
};

function numeroBR(n: number, casas = 2): string {
  return n.toFixed(casas).replace('.', ',');
}

function textoLimpo(s: string | null | undefined): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

function descricaoInline(partes: Array<string | null | undefined>): string {
  return partes.map((p) => textoLimpo(p)).filter(Boolean).join(' | ');
}

function nomeCamada(camada: CamadaProdutoCortina, index: number): string {
  return textoLimpo(camada.nome) || (index === 0 ? 'Frente' : `Camada ${index + 1}`);
}

function modeloLimpo(modelo: string): string {
  return textoLimpo(modelo).replace(/^cortina\s+/i, '');
}

function modeloLabel(modelo: ModeloCamadaEntrada | null | undefined): string {
  if (!modelo) return 'Cortina';
  if (modelo === 'costurado_junto') return 'Costurado junto';
  if (ehVariantePrega(modelo)) return MODELOS_PREGA_VARIANTE_LABEL[modelo] ?? modelo;
  return MODELOS_CORTINA_LABEL[modelo] ?? modelo;
}

function aberturaLabel(aberturas: number | string | null | undefined): string {
  const n = Number(aberturas);
  if (n === 2) return 'Central';
  if (n === 1 || !Number.isFinite(n) || n <= 0) return 'Sem abertura';
  return `${n} aberturas`;
}

function franzidoLabel(franzido: number | string | null | undefined): string | null {
  if (franzido === null || franzido === undefined || franzido === '') return null;
  const n = Number(franzido);
  if (!Number.isFinite(n)) return null;
  return `${numeroBR(n, Number.isInteger(n) ? 0 : 1)}x`;
}

export function nomeProdutoCortina(params: {
  ambiente?: string | null;
  modelo_cortina_nome?: string | null;
  modelo_fallback?: ModeloCortina | null;
  largura: number;
  altura: number;
}): string {
  const ambiente = textoLimpo(params.ambiente);
  const modelo = modeloLimpo(params.modelo_cortina_nome || modeloLabel(params.modelo_fallback));
  const partes = ['Cortina', ambiente, modelo].filter(Boolean);
  return `${partes.join(' ')} L:${numeroBR(params.largura)}m X A:${numeroBR(params.altura)}m`;
}

export function descricaoProdutoCortina(params: {
  fixacao: FixacaoCortina;
  aberturas?: number | string | null;
  camadas: CamadaProdutoCortina[];
}): string {
  const partes = [
    `Fixação: ${FIXACAO_LABEL[params.fixacao] ?? params.fixacao}`,
    `Abertura: ${aberturaLabel(params.aberturas)}`,
  ];

  params.camadas.forEach((camada, i) => {
    partes.push(`${nomeCamada(camada, i)}: ${modeloLabel(camada.modelo)}`);
    partes.push(`Tecido: ${textoLimpo(camada.tecido_nome)}`);
    const franzido = franzidoLabel(camada.franzido);
    if (franzido) partes.push(`Franzido: ${franzido}`);
  });

  return descricaoInline(partes);
}
