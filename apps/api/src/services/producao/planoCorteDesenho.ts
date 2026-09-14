// apps/api/src/services/producao/planoCorteDesenho.ts
// Desenha o plano de corte na folha de produção do pedido.
//
// O número sozinho não serve para quem corta. "2,60 m do rolo de 2,80" não diz
// onde encostar a tesoura — e é justamente a informação que a Pérsia passou a
// ter: qual rolo, em que sentido, e quais peças dividem cada faixa.
//
//   SCREEN 3% PANAMA OFF WHITE/01 3,00M          2,60 m · 7,80 m²
//   ┌──────────┬──────────┬────────────────┐
//   │ sala     │ quarto   │     sobra      │  faixa 1 — 2,60 m
//   │ 0,80     │ 0,80     │     1,20       │
//   └──────────┴──────────┴────────────────┘
//
// A sobra aparece desenhada de propósito. Quem corta precisa ver que aquela
// largura ficou de fora para decidir se aproveita em outra coisa — some-la
// deixaria o desenho parecendo mais eficiente do que é.

import type PDFDocument from 'pdfkit';

type Doc = InstanceType<typeof PDFDocument>;

export interface FaixaDesenho {
  comprimento: number;
  sobra_largura: number;
  pecas: { ref: number; largura: number; altura: number; orientacao: 'normal' | 'girada' }[];
}

export interface LoteDesenho {
  tecido_nome: string;
  unidade: string;
  rolo: { id: string; nome: string; dimensao_m: number };
  metros_lineares: number;
  area_consumida_m2: number;
  faixas: FaixaDesenho[];
  ambientes: { ref: number; ambiente: string }[];
}

export interface PlanoCorteDesenho {
  gerado_em?: string;
  lotes: LoteDesenho[];
}

const num = (v: number, casas = 2): string => v.toFixed(casas).replace('.', ',');

/** Só vale desenhar quando há plano com faixa — lote vazio vira página em branco. */
export function temPlanoDesenhavel(plano: unknown): plano is PlanoCorteDesenho {
  const p = plano as PlanoCorteDesenho | null;
  return Boolean(p && Array.isArray(p.lotes) && p.lotes.some((l) => (l.faixas ?? []).length > 0));
}

/**
 * Uma página com o plano de corte de todos os tecidos do pedido.
 *
 * Escala ÚNICA na página inteira, nos dois eixos: o rolo mais largo do pedido
 * ocupa a largura útil da folha, e a faixa mais longa dimensiona a altura. Duas
 * faixas de 2,60 m saem do mesmo tamanho mesmo em tecidos diferentes, e um rolo
 * de 2,80 sai visivelmente mais estreito que um de 3,00.
 *
 * Duas coisas que eu tentei antes e estavam erradas: travar a altura de cada
 * faixa num teto fazia uma faixa de 0,80 m sair do tamanho de uma de 2,60; e
 * esticar cada rolo até a largura da folha fazia todos parecerem igualmente
 * largos. Nos dois casos o desenho mentia exatamente sobre o que se vai olhar
 * nele.
 *
 * X e Y não compartilham a mesma escala — as faixas são mais achatadas que na
 * vida real para caber na folha. A medida escrita fica em cada retângulo.
 */
export function desenharPlanoDeCorte(doc: Doc, plano: PlanoCorteDesenho, cabecalho: string): void {
  const left = doc.page.margins.left;
  const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const fundo = doc.page.height - doc.page.margins.bottom;

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('PLANO DE CORTE', left, doc.page.margins.top);
  doc.font('Helvetica').fontSize(8.5).fillColor('#444')
    .text(cabecalho, left, doc.y + 2)
    .text('Quantas peças saem de cada faixa do rolo. A sobra é o que fica de largura livre.', left, doc.y + 1);
  doc.fillColor('#000');

  let y = doc.y + 12;

  const comFaixas = plano.lotes.filter((l) => (l.faixas ?? []).length > 0);
  const roloMaisLargo = Math.max(...comFaixas.map((l) => l.rolo.dimensao_m), 0.01);
  const faixaMaisLonga = Math.max(...comFaixas.flatMap((l) => l.faixas.map((f) => f.comprimento)), 0.01);
  const totalFaixas = comFaixas.reduce((n, l) => n + l.faixas.length, 0);
  const escalaX = largura / roloMaisLargo;
  // Cabe o pedido inteiro numa folha quando dá; passando disso, o teto por faixa
  // segura e o desenho continua legível, rolando para a página seguinte.
  const alturaUtil = doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 60;
  const escalaY = Math.min(escalaX, Math.max(alturaUtil / Math.max(totalFaixas, 1), 34) / faixaMaisLonga);

  for (const lote of plano.lotes) {
    const faixas = lote.faixas ?? [];
    if (faixas.length === 0) continue;

    const nomePorRef = new Map((lote.ambientes ?? []).map((a) => [a.ref, a.ambiente]));
    const consumo = lote.unidade === 'm²'
      ? `${num(lote.metros_lineares)} m de rolo · ${num(lote.area_consumida_m2)} m²`
      : `${num(lote.metros_lineares)} m de rolo`;

    if (y > fundo - 90) { doc.addPage(); y = doc.page.margins.top; }

    doc.font('Helvetica-Bold').fontSize(9.5).text(lote.rolo.nome, left, y, { width: largura - 150 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#444')
      .text(consumo, left + largura - 150, y, { width: 150, align: 'right' });
    doc.fillColor('#000');
    y += 14;

    for (let i = 0; i < faixas.length; i++) {
      const faixa = faixas[i];
      // Piso de 20 pt: abaixo disso não cabe o nome do ambiente dentro do
      // retângulo, e um desenho sem nome não serve para quem corta.
      const altura = Math.max(faixa.comprimento * escalaY, 20);
      if (y + altura > fundo - 18) { doc.addPage(); y = doc.page.margins.top; }

      let x = left;
      for (const peca of faixa.pecas) {
        const w = peca.largura * escalaX;
        doc.rect(x, y, w, altura).lineWidth(0.8).strokeColor('#333').stroke();
        const nome = nomePorRef.get(peca.ref) ?? '';
        const legenda = `${num(peca.largura)} x ${num(peca.altura)}${peca.orientacao === 'girada' ? ' (girada)' : ''}`;
        doc.fontSize(7).fillColor('#000');
        if (nome) doc.text(nome, x + 3, y + 4, { width: Math.max(w - 6, 8), height: 9, ellipsis: true });
        doc.fillColor('#444').text(legenda, x + 3, y + (nome ? 13 : 6), { width: Math.max(w - 6, 8), height: 9, ellipsis: true });
        doc.fillColor('#000');
        x += w;
      }

      if (faixa.sobra_largura > 0.005) {
        const w = faixa.sobra_largura * escalaX;
        doc.save().rect(x, y, w, altura).fillOpacity(0.06).fill('#000').restore();
        doc.rect(x, y, w, altura).lineWidth(0.5).dash(2, { space: 2 }).strokeColor('#999').stroke().undash();
        doc.fontSize(7).fillColor('#777')
          .text(`sobra ${num(faixa.sobra_largura)}`, x + 3, y + 4, { width: Math.max(w - 6, 8), height: 9, ellipsis: true });
        doc.fillColor('#000');
      }

      doc.fontSize(6.5).fillColor('#777')
        .text(`faixa ${i + 1} - ${num(faixa.comprimento)} m`, left, y + altura + 3, { width: largura });
      doc.fillColor('#000');
      y += altura + 14;
    }

    y += 6;
  }
}
