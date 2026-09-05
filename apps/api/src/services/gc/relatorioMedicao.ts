// apps/api/src/services/gc/relatorioMedicao.ts
// O texto que registra a medição do técnico dentro do pedido, no GestãoClick.
//
// Existe porque a medida certa vivia só na Pérsia e na Agenda: quem abrisse o
// pedido no ERP via o valor cobrado, mas não de onde ele veio. Quando a medida
// muda depois da venda — o cliente pagou antes da visita — o pedido original
// passa a mostrar um número que não corresponde mais ao que foi fabricado.
//
// Os dois pedidos se apontam. No original fica o número do pedido que cobra a
// diferença; no da diferença, o número do original. Assim qualquer um dos dois
// que a pessoa abrir primeiro leva ao outro, sem precisar da Pérsia para
// entender o par.
//
// Texto puro, sem colunas alinhadas: o campo do GC não é monoespaçado, e tabela
// desalinhada é mais difícil de ler que uma linha por ambiente.

/** Uma linha da conferência, no formato que a prévia de medição já produz. */
export interface ItemConferido {
  ambiente: string;
  largura_vendida: number;
  altura_vendida: number;
  largura_final: number;
  altura_final: number;
  alterado: boolean;
}

export interface DadosRelatorio {
  itens: ItemConferido[];
  /** Números das OS do Agenda de onde saiu a medida. */
  os_agenda: number[];
  /** Base do Agenda, para montar o link. Vazio = não inclui link. */
  agenda_base_url?: string;
  /** Data da conferência; hoje, quando ausente. */
  data?: Date;
}

const num = (v: number): string =>
  Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '?';

const medida = (l: number, a: number): string => `${num(l)} × ${num(a)} m`;

const dataBr = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

const dinheiro = (v: number): string =>
  `R$ ${Math.abs(v).toFixed(2).replace('.', ',')}`;

/**
 * O bloco comum aos dois pedidos: as medidas do técnico e de onde elas vieram.
 *
 * Lista TODAS as peças, não só as que mudaram. O propósito deste texto é ser o
 * arquivo do que foi realmente fabricado — quem abrir o pedido daqui a um ano
 * precisa das medidas inteiras, não de um errata. As que mudaram mostram também
 * o que havia sido vendido, para a diferença ficar visível sem precisar caçar.
 *
 * Vale igual quando a diferença é absorvida: não ter cobrado não torna a medida
 * do técnico menos oficial, e é justamente aí que ela não existe em nenhum outro
 * lugar do GestãoClick.
 */
function corpo(d: DadosRelatorio): string[] {
  const linhas: string[] = [`MEDIÇÃO TÉCNICA — conferida em ${dataBr(d.data ?? new Date())}`, ''];

  if (d.itens.length === 0) {
    linhas.push('Sem itens conferidos.');
  } else {
    linhas.push('Medidas do técnico (todas as peças):');
    for (const i of d.itens) {
      const base = `  ${i.ambiente || 'Item'}: ${medida(i.largura_final, i.altura_final)}`;
      linhas.push(i.alterado
        ? `${base}   (vendido ${medida(i.largura_vendida, i.altura_vendida)})`
        : base);
    }
  }

  if (d.os_agenda.length > 0) {
    linhas.push('');
    const base = (d.agenda_base_url ?? '').replace(/\/$/, '');
    for (const os of d.os_agenda) {
      linhas.push(base ? `OS do Agenda #${os}: ${base}/?os=${os}` : `OS do Agenda #${os}`);
    }
  }
  return linhas;
}

/**
 * Texto para o pedido ORIGINAL — o que o cliente já tinha pago.
 *
 * `pedidoDiferenca` é o pedido que cobra o complemento; sem ele, a diferença foi
 * absorvida pela empresa e é isso que fica registrado. Nos dois casos as medidas
 * novas ficam aqui, que é o motivo de existir este relatório.
 */
export function relatorioPedidoOriginal(
  d: DadosRelatorio,
  desfecho: { pedido_diferenca: string } | { absorvida: true; valor: number },
): string {
  const linhas = corpo(d);
  linhas.push('');
  if ('pedido_diferenca' in desfecho) {
    linhas.push(`Diferença cobrada no pedido ${desfecho.pedido_diferenca}.`);
  } else {
    linhas.push(`Diferença de ${dinheiro(desfecho.valor)} absorvida pela empresa — sem cobrança adicional.`);
  }
  return linhas.join('\n');
}

/**
 * Texto para o pedido NOVO, o que cobra só a diferença.
 *
 * Leva as mesmas medidas do original de propósito: quem abre o pedido da
 * diferença precisa entender o que está pagando sem ter que achar o outro
 * pedido antes.
 */
export function relatorioPedidoDiferenca(
  d: DadosRelatorio,
  pedidoOriginal: string,
  valorDiferenca: number,
): string {
  const linhas = corpo(d);
  linhas.push('');
  linhas.push(`Complemento do pedido ${pedidoOriginal} — diferença de ${dinheiro(valorDiferenca)} após a medição técnica.`);
  return linhas.join('\n');
}
