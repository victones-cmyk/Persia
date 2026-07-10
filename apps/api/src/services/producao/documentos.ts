import PDFDocument from 'pdfkit';
import type { TipoProduto } from '@prisma/client';

export interface ComponenteSnapshot {
  grupo?: string;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
}

export interface ItemProducaoSnapshot {
  ambiente?: string;
  tipo?: string;
  tecido_nome?: string;
  tecido_codigo_gc?: string;
  largura_m?: number;
  altura_m?: number;
  dimensao_m?: number;
  tc_m?: number;
  acionamento?: string | null;
  cor_acessorio?: string | null;
  rolamento?: string | null;
  base?: string | null;
  comando?: string | null;
  instalacao_nome?: string | null;
  nome_produto?: string;
  descricao_produto?: string;
  qtd_venda?: number;
  qtd_producao?: number;
  componentes?: ComponenteSnapshot[];
}

export interface OrdemDocumento {
  codigo: string;
  pedidoCodigo: string;
  orcamentoCodigo: string;
  cliente: string;
  loja?: string | null;
  vendedor?: string | null;
  tipoProduto: TipoProduto | string;
  criadoEm: Date;
  entradaEm?: Date | null;
  entregaEm?: Date | null;
  item: ItemProducaoSnapshot;
}

function texto(v: unknown, fallback = '-'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function numero(v: unknown, casas = 2): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function dataBR(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function dataCurtaBR(d: Date | null | undefined): string {
  if (!d) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

function tipoLabel(t: string): string {
  if (t === 'cortina') return 'Cortina';
  if (t === 'misto') return 'Misto';
  return 'Persiana';
}

function tipoPersianaLabel(v: unknown): string {
  const s = texto(v, '');
  if (!s) return 'Persiana';
  return s
    .replace(/^persiana[_\s-]*/i, 'Persiana ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function produtoResumo(item: ItemProducaoSnapshot): string {
  return texto(item.nome_produto || item.tipo, 'Produto');
}

function abreviar(v: unknown, max = 72): string {
  const s = texto(v, '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function linhasTecnicas(item: ItemProducaoSnapshot): Array<[string, string]> {
  const linhas: Array<[string, string]> = [
    ['Ambiente', texto(item.ambiente)],
    ['Produto', produtoResumo(item)],
    ['Tecido', texto(item.tecido_nome)],
    ['Codigo tecido', texto(item.tecido_codigo_gc)],
    ['Largura', `${numero(item.largura_m)} m`],
    ['Altura', `${numero(item.altura_m)} m`],
    ['Dimensao', item.dimensao_m === undefined ? '-' : `${numero(item.dimensao_m)} m`],
    ['Qtd. producao', item.qtd_producao === undefined ? '-' : `${numero(item.qtd_producao)} m`],
    ['Instalacao', texto(item.instalacao_nome)],
    ['Acionamento', texto(item.acionamento)],
    ['Cor acessorio', texto(item.cor_acessorio)],
    ['Rolamento', texto(item.rolamento)],
    ['Base', texto(item.base)],
    ['Comando', texto(item.comando)],
    ['TC', item.tc_m === undefined ? '-' : `${numero(item.tc_m)} m`],
  ];
  return linhas.filter(([, v]) => v !== '-');
}

function drawBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number): void {
  doc.save().lineWidth(0.8).strokeColor('#d7dce0').rect(x, y, w, h).stroke().restore();
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, w: number): void {
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#5f6973').text(label, x, y, { width: w, height: 10 });
  doc.font('Helvetica').fontSize(9).fillColor('#111111').text(abreviar(value, 44), x, y + 11, { width: w, height: 24 });
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, x: number, y: number, w: number): void {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(title, x, y, { width: w });
  doc.moveTo(x, y + 14).lineTo(x + w, y + 14).strokeColor('#d7dce0').stroke();
}

function primeiroNome(v: unknown): string {
  return texto(v, '').trim().split(/\s+/)[0] || '-';
}

function ehPersianaDocumento(ordem: OrdemDocumento): boolean {
  const item = ordem.item;
  return String(ordem.tipoProduto) !== 'cortina'
    && Boolean(item.acionamento || item.base || item.comando || item.tc_m !== undefined || item.rolamento);
}

function campoPdf(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h = 30,
  fill = '#ffffff',
): void {
  doc.save().fillColor(fill).rect(x, y, w, h).fill().lineWidth(0.7).strokeColor('#cfd6dd').rect(x, y, w, h).stroke().restore();
  doc.font('Helvetica-Bold').fontSize(5.8).fillColor('#5d6873').text(label, x + 7, y + 6, { width: w - 14, height: 8 });
  const darkFill = ['#2f3133', '#9a765d'].includes(fill);
  doc.font('Helvetica').fontSize(8).fillColor(darkFill ? '#ffffff' : '#111111').text(abreviar(value, 62), x + 7, y + 15, { width: w - 14, height: h - 16 });
}

function corCampoPdf(v: unknown): string {
  const s = texto(v, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!s) return '#ffffff';
  if (s.includes('preto')) return '#2f3133';
  if (s.includes('marrom') || s.includes('cafe')) return '#9a765d';
  if (s.includes('bege') || s.includes('champagne')) return '#e8dcc8';
  if (s.includes('cinza')) return '#d7dce0';
  if (s.includes('aluminio') || s.includes('prata')) return '#dce1e5';
  if (s.includes('branco')) return '#ffffff';
  return '#ffffff';
}

function garantirFormularioPdf(doc: PDFKit.PDFDocument): void {
  const d = doc as PDFKit.PDFDocument & { _acroform?: unknown };
  if (!d._acroform) doc.initForm();
}

function checkboxPdf(doc: PDFKit.PDFDocument, name: string, x: number, y: number, label: string, checked: boolean): void {
  doc.save().lineWidth(0.7).strokeColor('#6d7680').rect(x, y, 7, 7).stroke().restore();
  if (checked) {
    doc.save().lineWidth(1).strokeColor('#111111').moveTo(x + 1.5, y + 3.5).lineTo(x + 3.2, y + 5.5).lineTo(x + 6, y + 1.5).stroke().restore();
  }
  garantirFormularioPdf(doc);
  doc.formCheckbox(name, x - 1, y - 1, 9, 9, {
    borderColor: '#6d7680',
    backgroundColor: '#ffffff',
  });
  doc.font('Helvetica').fontSize(8).fillColor('#111111').text(label, x + 11, y - 1, { width: 58, height: 10 });
}

function campoInstalacaoPdf(doc: PDFKit.PDFDocument, ordemCodigo: string, x: number, y: number, w: number): void {
  campoPdf(doc, 'Instalacao', '', x, y, w, 30);
  const slug = ordemCodigo.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  checkboxPdf(doc, `instalacao_parede_${slug}`, x + 8, y + 16, 'Parede', false);
  checkboxPdf(doc, `instalacao_teto_${slug}`, x + 70, y + 16, 'Teto', false);
}

function desenharPdfPersiana(doc: PDFKit.PDFDocument, ordem: OrdemDocumento): void {
  const item = ordem.item;
  const left = 36;
  const pageW = 523;
  const gap = 8;
  const ink = '#15191d';
  const muted = '#5d6873';
  const line = '#cfd6dd';
  const soft = '#f1f3f5';

  doc.rect(0, 0, 595, 76).fill(soft);
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(18).text('Ordem de Producao', left, 22, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(11).text(ordem.codigo, 372, 19, { width: 187, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(muted).text(`Gerada em ${dataBR(ordem.criadoEm)}`, 372, 39, { width: 187, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(`Entrega: ${dataCurtaBR(ordem.entregaEm)}`, 372, 57, { width: 187, align: 'right' });

  const metaY = 98;
  const metaW = (pageW - gap * 3) / 4;
  [
    ['Pedido', ordem.pedidoCodigo],
    ['Cliente', ordem.cliente],
    ['Vendedor', primeiroNome(ordem.vendedor)],
    ['Instalacao', texto(item.instalacao_nome)],
  ].forEach(([label, value], index) => {
    campoPdf(doc, label, value, left + index * (metaW + gap), metaY, metaW, 48);
  });

  const produtoY = 168;
  sectionTitle(doc, 'Produto', left, produtoY, pageW);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(abreviar(produtoResumo(item), 112), left, produtoY + 23, { width: pageW, height: 18 });

  const dadosY = 224;
  sectionTitle(doc, 'Dados tecnicos', left, dadosY, pageW);
  const colW = (pageW - gap) / 2;
  const rowH = 36;
  const y0 = dadosY + 24;
  campoPdf(doc, 'Ambiente', texto(item.ambiente), left, y0, colW, 30);
  campoPdf(doc, 'Tecido', texto(item.tecido_nome), left + colW + gap, y0, colW, 30);
  campoPdf(doc, 'Largura', `${numero(item.largura_m)} m`, left, y0 + rowH, (colW - gap) / 2, 30);
  campoPdf(doc, 'Altura', `${numero(item.altura_m)} m`, left + (colW + gap) / 2, y0 + rowH, (colW - gap) / 2, 30);
  campoPdf(doc, 'Tipo', tipoPersianaLabel(item.tipo || ordem.tipoProduto), left + colW + gap, y0 + rowH, colW, 30);
  campoPdf(doc, 'Acessorios', texto(item.cor_acessorio), left, y0 + rowH * 2, colW, 30, corCampoPdf(item.cor_acessorio));
  campoPdf(doc, 'Base', texto(item.base), left + colW + gap, y0 + rowH * 2, colW, 30, corCampoPdf(item.base));
  campoPdf(doc, 'Tamanho do comando', item.tc_m === undefined ? '-' : `${numero(item.tc_m)} m`, left, y0 + rowH * 3, (colW - gap) / 2, 30);
  campoPdf(doc, 'Comando', texto(item.comando), left + (colW + gap) / 2, y0 + rowH * 3, (colW - gap) / 2, 30);
  campoPdf(doc, 'Rolamento', texto(item.rolamento), left + colW + gap, y0 + rowH * 3, colW, 30);
  campoPdf(doc, 'Acionamento', texto(item.acionamento), left, y0 + rowH * 4, colW, 30);
  campoInstalacaoPdf(doc, ordem.codigo, left + colW + gap, y0 + rowH * 4, colW);

  const compY = 450;
  sectionTitle(doc, 'Componentes e materiais', left, compY, pageW);
  const componentes = ordem.item.componentes ?? [];
  const headerY = compY + 24;
  const footerY = 788;
  const headerH = 18;
  const available = footerY - headerY - headerH;
  const rowHComp = Math.max(7.4, Math.min(15, available / Math.max(componentes.length, 1)));
  const fontSize = rowHComp < 8.5 ? 4.8 : rowHComp < 11 ? 5.5 : rowHComp < 13 ? 6.1 : 6.8;
  const descW = 330;
  const qtdX = left + 438;
  const unX = left + 492;

  doc.rect(left, headerY, pageW, headerH).fill(soft);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(ink);
  doc.text('Grupo', left + 8, headerY + 5, { width: 82 });
  doc.text('Descricao', left + 98, headerY + 5, { width: descW });
  doc.text('Qtd.', qtdX, headerY + 5, { width: 42, align: 'right' });
  doc.text('Un.', unX, headerY + 5, { width: 34 });

  componentes.forEach((c, index) => {
    const y = headerY + headerH + index * rowHComp;
    doc.moveTo(left, y).lineTo(left + pageW, y).strokeColor('#e3e7eb').stroke();
    doc.font('Helvetica').fontSize(fontSize).fillColor(ink);
    doc.text(abreviar(c.grupo, 18), left + 8, y + 3, { width: 82, height: rowHComp - 3 });
    doc.text(abreviar(c.descricao, 92), left + 98, y + 3, { width: descW, height: rowHComp - 3 });
    doc.text(numero(c.quantidade), qtdX, y + 3, { width: 42, height: rowHComp - 3, align: 'right' });
    doc.text(abreviar(c.unidade, 8), unX, y + 3, { width: 34, height: rowHComp - 3 });
  });

  const tableH = headerH + Math.max(componentes.length, 1) * rowHComp;
  doc.save().lineWidth(0.7).strokeColor(line).rect(left, headerY, pageW, tableH).stroke().restore();
  doc.font('Helvetica').fontSize(7).fillColor(muted).text('Conferir medidas, tecido e acessorios antes da producao.', left, 798, { width: pageW, height: 10 });
}

export async function gerarPdfOrdemProducao(ordem: OrdemDocumento): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Ordem de Producao ${ordem.codigo}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (ehPersianaDocumento(ordem)) {
      desenharPdfPersiana(doc, ordem);
      doc.end();
      return;
    }

    const left = 36;
    const pageW = 523;

    doc.rect(0, 0, 595, 70).fill('#f3f5f7');
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(18).text('Ordem de Producao', left, 22, { width: 260 });
    doc.font('Helvetica-Bold').fontSize(12).text(ordem.codigo, 350, 20, { width: 209, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text(`Gerada em ${dataBR(ordem.criadoEm)}`, 350, 39, { width: 209, align: 'right' });

    const metaY = 88;
    const boxH = 48;
    const gap = 8;
    const boxW = (pageW - gap * 3) / 4;
    [
      ['Pedido', ordem.pedidoCodigo],
      ['Orcamento GC', ordem.orcamentoCodigo],
      ['Cliente', ordem.cliente],
      ['Tipo', tipoLabel(String(ordem.tipoProduto))],
    ].forEach(([label, value], i) => {
      const x = left + i * (boxW + gap);
      drawBox(doc, x, metaY, boxW, boxH);
      labelValue(doc, label, value, x + 8, metaY + 8, boxW - 16);
    });

    const produtoY = 154;
    sectionTitle(doc, 'Produto', left, produtoY, pageW);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(abreviar(produtoResumo(ordem.item), 96), left, produtoY + 24, { width: pageW, height: 34 });

    const dadosY = 224;
    sectionTitle(doc, 'Dados tecnicos', left, dadosY, pageW);
    const tech = linhasTecnicas(ordem.item).filter(([label]) => !['Produto'].includes(label)).slice(0, 12);
    const cellW = (pageW - gap) / 2;
    tech.forEach(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = left + col * (cellW + gap);
      const y = dadosY + 24 + row * 36;
      drawBox(doc, x, y, cellW, 30);
      labelValue(doc, label, value, x + 7, y + 5, cellW - 14);
    });

    const compY = 478;
    sectionTitle(doc, 'Componentes e materiais', left, compY, pageW);
    const headerY = compY + 24;
    doc.rect(left, headerY, pageW, 20).fill('#f3f5f7');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111');
    doc.text('Grupo', left + 8, headerY + 6, { width: 84 });
    doc.text('Descricao', left + 98, headerY + 6, { width: 295 });
    doc.text('Qtd.', left + 406, headerY + 6, { width: 56, align: 'right' });
    doc.text('Un.', left + 474, headerY + 6, { width: 40 });

    const componentes = (ordem.item.componentes ?? []).slice(0, 14);
    componentes.forEach((c, index) => {
      const y = headerY + 20 + index * 18;
      doc.moveTo(left, y).lineTo(left + pageW, y).strokeColor('#e4e7ea').stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor('#111111');
      doc.text(abreviar(c.grupo, 18), left + 8, y + 5, { width: 84, height: 10 });
      doc.text(abreviar(c.descricao, 78), left + 98, y + 5, { width: 295, height: 10 });
      doc.text(numero(c.quantidade), left + 406, y + 5, { width: 56, height: 10, align: 'right' });
      doc.text(abreviar(c.unidade, 8), left + 474, y + 5, { width: 40, height: 10 });
    });
    const tableBottom = headerY + 20 + Math.max(componentes.length, 1) * 18;
    drawBox(doc, left, headerY, pageW, Math.max(38, tableBottom - headerY));
    if ((ordem.item.componentes?.length ?? 0) > componentes.length) {
      doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text(`+ ${(ordem.item.componentes?.length ?? 0) - componentes.length} componente(s) adicional(is) no calculo original.`, left, tableBottom + 6);
    }

    const obsY = 770;
    doc.moveTo(left, obsY - 8).lineTo(left + pageW, obsY - 8).strokeColor('#d7dce0').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text('Conferir medidas, tecido e acessorios antes do corte/producao.', left, obsY, { width: pageW });

    doc.end();
  });
}

function zplText(value: unknown, max = 90): string {
  return texto(value, '').replace(/\^/g, '').replace(/~/g, '').slice(0, max);
}

function zplLine(x: number, y: number, fontH: number, fontW: number, width: number, value: unknown, maxLines = 1, maxChars = 90): string {
  return `^FO${x},${y}^A0N,${fontH},${fontW}^FB${width},${maxLines},2,L,0^FD${zplText(value, maxChars)}^FS`;
}

function componentesPorGrupo(item: ItemProducaoSnapshot, grupo: string): ComponenteSnapshot[] {
  return (item.componentes ?? []).filter((c) => texto(c.grupo, '').toLowerCase() === grupo.toLowerCase());
}

function descComponente(c: ComponenteSnapshot | undefined): string {
  return texto(c?.descricao, '');
}

function tecidoSemPrefixo(v: string): string {
  return v.replace(/^(frente|camada\s*\d+)\s*:\s*/i, '').trim();
}

function suporteCortina(item: ItemProducaoSnapshot): string {
  const suporte = (item.componentes ?? []).find((c) => {
    const d = texto(c.descricao, '').toLowerCase();
    return d.includes('trilho') || d.includes('varao') || d.includes('varão') || d.includes('suico') || d.includes('suiço');
  });
  if (!suporte) return '';
  const qtd = Number(suporte.quantidade);
  const medida = Number.isFinite(qtd) && qtd > 0
    ? ` - ${numero(qtd)} ${texto(suporte.unidade, 'm')}`
    : '';
  return `${descComponente(suporte)}${medida}`;
}

function gerarZplEtiquetaCortina(ordem: OrdemDocumento, width: number, height: number, marginLeft: number, marginRight: number): string {
  const item = ordem.item;
  const contentW = width - marginLeft - marginRight;
  const tecidos = componentesPorGrupo(item, 'Tecido');
  const frente = tecidoSemPrefixo(descComponente(tecidos[0]));
  const camada2 = tecidoSemPrefixo(descComponente(tecidos[1]));
  const suporte = suporteCortina(item);
  const clienteW = Math.round(contentW * 0.56);
  const pedidoW = contentW - clienteW - 10;

  return [
    '^XA',
    '^CI28',
    `^PW${width}`,
    `^LL${height}`,
    '^LH0,0',
    zplLine(marginLeft, 14, 26, 26, pedidoW, `Pedido ${ordem.pedidoCodigo}`, 1, 24),
    zplLine(marginLeft + pedidoW + 10, 14, 24, 24, clienteW, ordem.cliente, 1, 42),
    zplLine(marginLeft, 48, 23, 23, contentW, `Amb: ${texto(item.ambiente, '')}`, 1, 58),
    zplLine(marginLeft, 78, 22, 22, contentW, produtoResumo(item), 2, 88),
    zplLine(marginLeft, 128, 17, 17, contentW, `Frente: ${frente}`, 2, 118),
    camada2 ? zplLine(marginLeft, 166, 17, 17, contentW, `Camada 2: ${camada2}`, 2, 118) : '',
    suporte ? zplLine(marginLeft, camada2 ? 224 : 184, 19, 19, contentW, suporte, 1, 96) : '',
    '^XZ',
  ].filter(Boolean).join('\n');
}

export function gerarZplEtiqueta(ordem: OrdemDocumento, dpi = 203): string {
  const dotsPorMm = dpi / 25.4;
  const width = Math.round(100 * dotsPorMm);
  const height = Math.round(35 * dotsPorMm);
  const marginLeft = Math.round(4 * dotsPorMm);
  const marginRight = Math.round(3 * dotsPorMm);
  const item = ordem.item;
  const temCamposPersiana = Boolean(item.acionamento || item.base || item.comando || item.tc_m !== undefined);
  const ehCortina = String(ordem.tipoProduto) === 'cortina'
    || (!temCamposPersiana && componentesPorGrupo(item, 'Tecido').length > 0);
  if (ehCortina) {
    return gerarZplEtiquetaCortina(ordem, width, height, marginLeft, marginRight);
  }

  const marginLeftPersiana = marginLeft + Math.round(3 * dotsPorMm);
  const contentW = width - marginLeftPersiana - marginRight;
  const produto = zplText(produtoResumo(item));
  const tecido = zplText(item.tecido_nome);
  const qrSize = Math.round(18 * dotsPorMm);
  const qrX = width - marginRight - qrSize;
  const textW = qrX - marginLeftPersiana - 12;
  const pedidoW = Math.round(textW * 0.36);
  const clienteW = textW - pedidoW - 10;
  const entradaEntregaW = Math.round(textW * 0.53);
  const acessorios = [
    item.acionamento ? `AC:${item.acionamento}` : null,
    item.cor_acessorio ? `cor ${item.cor_acessorio}` : null,
    item.base ? `Base ${item.base}` : null,
  ].filter(Boolean).join(' ');
  const comando = [
    item.tc_m !== undefined ? `TC:${numero(item.tc_m)}m` : null,
    item.comando ? `Comando:${item.comando}` : null,
    item.rolamento ? `Rol:${item.rolamento}` : null,
  ].filter(Boolean).join('  ');
  const entrada = dataCurtaBR(ordem.entradaEm ?? new Date());
  const entrega = dataCurtaBR(ordem.entregaEm);
  const tipo = tipoPersianaLabel(item.tipo || ordem.tipoProduto);

  return [
    '^XA',
    '^CI28',
    `^PW${width}`,
    `^LL${height}`,
    '^LH0,0',
    zplLine(marginLeftPersiana, 12, 29, 29, pedidoW, `Pedido ${ordem.pedidoCodigo}`, 1, 24),
    zplLine(marginLeftPersiana + pedidoW + 10, 12, 27, 27, clienteW, ordem.cliente, 1, 42),
    zplLine(marginLeftPersiana, 46, 25, 25, textW, produto, 1, 62),
    zplLine(marginLeftPersiana, 78, 21, 21, entradaEntregaW, `Entrada:${entrada}`, 1, 22),
    zplLine(marginLeftPersiana + entradaEntregaW + 12, 78, 21, 21, textW - entradaEntregaW - 12, `Entrega:${entrega}`, 1, 22),
    zplLine(marginLeftPersiana, 108, 21, 21, textW, `Tipo:${tipo}`, 1, 66),
    zplLine(marginLeftPersiana, 138, 21, 21, textW, `Tecido:${tecido}`, 2, 104),
    zplLine(marginLeftPersiana, 193, 21, 21, textW, acessorios, 1, 88),
    zplLine(marginLeftPersiana, 224, 21, 21, textW, comando, 1, 80),
    `^FO${qrX},72^BQN,2,3^FDLA,${zplText(ordem.pedidoCodigo, 50)}^FS`,
    '^XZ',
  ].join('\n');
}
