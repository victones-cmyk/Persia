// apps/web/src/lib/divisaoFolhas.ts
// Divisão de um vão medido em folhas — a tradução entre a unidade da Agenda
// (o ambiente inteiro: "sacada de 10,80m") e a da Pérsia (as folhas: 8 persianas
// de 1,35m). O número de folhas é decisão do vendedor; o técnico só sugere.
//
// Cópia de apps/api/src/services/calc/divisaoFolhas.ts, onde ficam os testes —
// mesma convenção de roundHalfUp. Se mudar aqui, mude lá.

/**
 * Divide a largura total em N folhas de larguras iguais — ou o mais próximo
 * disso que 2 casas decimais permitem.
 *
 * Trabalha em centímetros inteiros e distribui a sobra folha a folha, de modo
 * que a SOMA das partes seja exatamente a largura medida. Dividir 10,00 em 3
 * ingenuamente daria 3,33 × 3 = 9,99 — um centímetro sumido do vão, que o
 * vendedor teria de caçar na mão.
 *
 * Retorna [] para entrada inválida: quem chama decide o que dizer ao usuário.
 */
export function dividirLarguraEmFolhas(larguraTotal: number, folhas: number): number[] {
  if (!Number.isFinite(larguraTotal) || larguraTotal <= 0) return [];
  if (!Number.isInteger(folhas) || folhas <= 0) return [];

  const totalCent = Math.round(larguraTotal * 100);
  if (totalCent < folhas) return []; // menos de 1cm por folha: divisão sem sentido

  const base = Math.floor(totalCent / folhas);
  const sobra = totalCent - base * folhas;
  return Array.from({ length: folhas }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
}
