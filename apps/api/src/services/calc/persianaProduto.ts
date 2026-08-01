// Formatação do produto sintético de persiana criado no GestãoClick.

import type { Acionamento } from './tipos';
import { ACIONAMENTO_LABEL } from './tipos';

function numeroBR(n: number, casas = 2): string {
  return n.toFixed(casas).replace('.', ',');
}

function textoLimpo(s: string | null | undefined): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

function produtoLimpo(produto: string): string {
  return textoLimpo(produto).replace(/^persiana\s+/i, '');
}

function descricaoInline(partes: Array<string | null | undefined>): string {
  return partes.map((p) => textoLimpo(p)).filter(Boolean).join(' | ');
}

export function nomeProdutoPersiana(params: {
  ambiente?: string | null;
  produto_sob_medida: string;
  largura: number;
  altura: number;
}): string {
  const ambiente = textoLimpo(params.ambiente);
  const produto = produtoLimpo(params.produto_sob_medida);
  const partes = ['Persiana', ambiente, produto].filter(Boolean);
  return `${partes.join(' ')} L:${numeroBR(params.largura)}m x A:${numeroBR(params.altura)}m`;
}

export function descricaoProdutoPersiana(params: {
  acionamento: Acionamento;
  cor_acessorio?: string | null;
  tecido_nome: string;
  rolamento?: string | null;
  comando?: string | null;
  tc: number;
  emissor?: boolean | null;
  emissor_nome?: string | null;
  canal?: string | null;
}): string {
  const partes = [
    `Acionamento: ${ACIONAMENTO_LABEL[params.acionamento] ?? params.acionamento}`,
    `Tecido: ${textoLimpo(params.tecido_nome)}`,
  ];
  const corAcessorio = textoLimpo(params.cor_acessorio);
  if (corAcessorio) partes.splice(1, 0, `Acessórios: ${corAcessorio}`);

  const rolamento = textoLimpo(params.rolamento);
  if (rolamento) partes.push(`Rolamento: ${rolamento}`);

  const comando = textoLimpo(params.comando);
  if (comando) partes.push(`Comando: ${comando}`);

  partes.push(`Tamanho Comando: ${numeroBR(params.tc)}m`);

  if (params.emissor) partes.push(`Emissor: ${textoLimpo(params.emissor_nome) || 'Sim'}`);
  const canal = textoLimpo(params.canal);
  if (canal) partes.push(canal);

  return descricaoInline(partes);
}
