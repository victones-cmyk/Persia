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
}): string {
  const linhas = [
    `Acionamento: ${ACIONAMENTO_LABEL[params.acionamento] ?? params.acionamento}`,
    `Acessórios: ${textoLimpo(params.cor_acessorio) || '-'}`,
    `Tecido: ${textoLimpo(params.tecido_nome)}`,
  ];

  const rolamento = textoLimpo(params.rolamento);
  if (rolamento) linhas.push(`Rolamento: ${rolamento}`);

  const comando = textoLimpo(params.comando);
  if (comando) linhas.push(`Comando: ${comando}`);

  linhas.push(`Tamanho Comando: ${numeroBR(params.tc)}m`);
  return linhas.join('\n');
}
