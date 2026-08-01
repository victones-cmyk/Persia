import PDFDocument from 'pdfkit';
import type { TipoProduto } from '@prisma/client';
import { ACIONAMENTO_LABEL } from '../calc/tipos';

export interface ComponenteSnapshot {
  grupo?: string;
  descricao?: string;
  quantidade?: number;
  quantidade_label?: string;
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
  emissor?: boolean | null;
  emissor_nome?: string | null;
  canal?: string | null;
  fixacao_instalacao?: string | null;
  instalacao_nome?: string | null;
  fixacao?: string | null;
  abertura?: string | number | null;
  desconto?: string | null;
  n_camadas?: number;
  camadas?: Array<{
    nome?: string | null;
    modelo?: string | null;
    tecido_nome?: string | null;
    metodo?: string | null;
    metragem?: number | null;
    tiras?: number | null;
    barra_postica_base?: number | null;
    barra_postica_acrescimo?: number | null;
  }>;
  nome_produto?: string;
  descricao_produto?: string;
  valor_final?: number;
  valor_total?: number;
  valor_custo?: number;
  qtd_venda?: number;
  qtd_producao?: number;
  etiqueta_embalagem_serial?: number;
  componentes?: ComponenteSnapshot[];
}

export interface EtiquetaEmbalagemMeta {
  pecaNumero: number;
  pecaTotal: number;
  serial: number;
}

export interface OrdemPecaMeta {
  tipo: 'persiana' | 'cortina';
  numero: number;
  total: number;
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
  peca?: OrdemPecaMeta | null;
  etiquetaEmbalagem?: EtiquetaEmbalagemMeta | null;
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

function tipoOrdemA4(ordem: OrdemDocumento): string {
  const tipo = ordem.peca?.tipo ?? (ehCortinaDocumento(ordem) ? 'cortina' : 'persiana');
  const label = tipoLabel(tipo);
  if (!ordem.peca) return label;
  return `${label} ${ordem.peca.numero}/${ordem.peca.total}`;
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

function acionamentoLabel(v: unknown): string {
  const s = texto(v, '');
  if (!s) return '-';
  return ACIONAMENTO_LABEL[s as keyof typeof ACIONAMENTO_LABEL] ?? s
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function linhasTecnicas(item: ItemProducaoSnapshot): Array<[string, string]> {
  const linhas: Array<[string, string]> = [
    ['Ambiente', texto(item.ambiente)],
    ['Produto', produtoResumo(item)],
    ['Tecido', texto(item.tecido_nome)],
    ['Código tecido', texto(item.tecido_codigo_gc)],
    ['Largura', `${numero(item.largura_m)} m`],
    ['Altura', `${numero(item.altura_m)} m`],
    ['Dimensao', item.dimensao_m === undefined ? '-' : `${numero(item.dimensao_m)} m`],
    ['Qtd. produção', item.qtd_producao === undefined ? '-' : `${numero(item.qtd_producao)} m`],
    ['Instalação', texto(item.instalacao_nome)],
    ['Acionamento', acionamentoLabel(item.acionamento)],
    ['Cor acessorio', texto(item.cor_acessorio)],
    ['Rolamento', texto(item.rolamento)],
    ['Base', texto(item.base)],
    ['Comando', texto(item.comando)],
    ['TC', item.tc_m === undefined ? '-' : `${numero(item.tc_m)} m`],
    ['Emissor', item.emissor ? texto(item.emissor_nome, 'Sim') : '-'],
    ['Canal', texto(item.canal)],
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

function ehCortinaDocumento(ordem: OrdemDocumento): boolean {
  return String(ordem.tipoProduto) === 'cortina'
    || Boolean(ordem.item.camadas?.length || componentesPorGrupo(ordem.item, 'Tecido').length);
}

function fixacaoCortinaLabel(v: unknown): string {
  const s = texto(v, '').toLowerCase();
  if (s === 'varao') return 'Varão';
  if (s === 'trilho') return 'Trilho';
  if (s === 'varao_suico') return 'Varão suíço';
  return texto(v);
}

function aberturaCortinaLabel(v: unknown): string {
  const s = texto(v, '').toLowerCase();
  if (s === '2' || s === 'central') return 'Central';
  if (s === '1' || s === 'sem_abertura' || s === 'sem abertura') return 'Sem abertura';
  return texto(v);
}

function descontoCortinaLabel(v: unknown): string {
  const s = texto(v, 'sem_desconto');
  const mapa: Record<string, string> = {
    teto_ao_chao: 'Teto ao chão',
    gesso_ao_chao: 'Gesso ao chão',
    sem_desconto: 'Sem desconto',
    varao_ao_chao: 'Varão ao chão',
    suporte_de_teto: 'Suporte de teto',
  };
  return mapa[s] ?? texto(v);
}

function modeloCortinaLabel(v: unknown): string {
  const s = texto(v, '').toLowerCase();
  const mapa: Record<string, string> = {
    ilhos: 'Ilhós',
    prega: 'Prega',
    prega_americana: 'Modelo Prega Americana',
    prega_macho: 'Modelo Prega Macho',
    prega_femea: 'Modelo Prega Fêmea',
    franzido: 'Franzido',
    wave: 'Wave',
  };
  return mapa[s] ?? texto(v);
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
  labelColor = '#5d6873',
  valueColor?: string,
  stroke = '#cfd6dd',
): void {
  doc.save().fillColor(fill).rect(x, y, w, h).fill().lineWidth(0.7).strokeColor(stroke).rect(x, y, w, h).stroke().restore();
  doc.font('Helvetica-Bold').fontSize(5.8).fillColor(labelColor).text(label, x + 7, y + 6, { width: w - 14, height: 8 });
  const darkFill = ['#2f3133', '#9a765d'].includes(fill);
  doc.font('Helvetica').fontSize(8).fillColor(valueColor ?? (darkFill ? '#ffffff' : '#111111')).text(abreviar(value, 62), x + 7, y + 15, { width: w - 14, height: h - 16 });
}

function ehAcionamentoMotorizado(v: unknown): boolean {
  const s = texto(v, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return s.includes('motoriz') || s === 'motor_com_bando' || s === 'motor_sem_bando';
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
  campoPdf(doc, 'Instalação', '', x, y, w, 30);
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
  const navy = '#0b2f4f';
  const navyMuted = '#d8e6f3';
  const motorFill = '#e5f1fb';
  const motorStroke = '#8bb7dd';
  const motorText = '#0b2f4f';
  const acionamentoMotorizado = ehAcionamentoMotorizado(item.acionamento);

  doc.rect(0, 0, 595, 76).fill(navy);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('Ordem de Produção', left, 22, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(navyMuted).text(tipoOrdemA4(ordem), left, 48, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text(ordem.codigo, 372, 19, { width: 187, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(navyMuted).text(`Gerada em ${dataBR(ordem.criadoEm)}`, 372, 39, { width: 187, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(navyMuted).text(`Entrega: ${dataCurtaBR(ordem.entregaEm)}`, 372, 57, { width: 187, align: 'right' });

  const metaY = 98;
  const metaW = (pageW - gap * 3) / 4;
  [
    ['Pedido', ordem.pedidoCodigo],
    ['Cliente', ordem.cliente],
    ['Vendedor', primeiroNome(ordem.vendedor)],
    ['Instalação', texto(item.instalacao_nome)],
  ].forEach(([label, value], index) => {
    campoPdf(doc, label, value, left + index * (metaW + gap), metaY, metaW, 36);
  });

  const produtoY = 150;
  sectionTitle(doc, 'Produto', left, produtoY, pageW);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(abreviar(produtoResumo(item), 112), left, produtoY + 23, { width: pageW, height: 18 });

  const dadosY = 204;
  sectionTitle(doc, 'Dados técnicos', left, dadosY, pageW);
  const colW = (pageW - gap) / 2;
  const rowH = 36;
  const y0 = dadosY + 24;
  campoPdf(doc, 'Ambiente', texto(item.ambiente), left, y0, colW, 30);
  campoPdf(doc, 'Tecido', texto(item.tecido_nome), left + colW + gap, y0, colW, 30);
  campoPdf(doc, 'Largura', `${numero(item.largura_m)} m`, left, y0 + rowH, (colW - gap) / 2, 30);
  campoPdf(doc, 'Altura', `${numero(item.altura_m)} m`, left + (colW + gap) / 2, y0 + rowH, (colW - gap) / 2, 30);
  campoPdf(doc, 'Tipo', tipoPersianaLabel(item.tipo || ordem.tipoProduto), left + colW + gap, y0 + rowH, colW, 30);
  campoPdf(doc, 'Acessórios', texto(item.cor_acessorio), left, y0 + rowH * 2, colW, 30, corCampoPdf(item.cor_acessorio));
  campoPdf(doc, 'Base', texto(item.base), left + colW + gap, y0 + rowH * 2, colW, 30, corCampoPdf(item.base));
  campoPdf(doc, 'Tamanho do comando', item.tc_m === undefined ? '-' : `${numero(item.tc_m)} m`, left, y0 + rowH * 3, (colW - gap) / 2, 30);
  campoPdf(doc, 'Comando', texto(item.comando), left + (colW + gap) / 2, y0 + rowH * 3, (colW - gap) / 2, 30);
  campoPdf(doc, 'Rolamento', texto(item.rolamento), left + colW + gap, y0 + rowH * 3, colW, 30);
  campoPdf(
    doc,
    'Acionamento',
    acionamentoLabel(item.acionamento),
    left,
    y0 + rowH * 4,
    colW,
    30,
    acionamentoMotorizado ? motorFill : '#ffffff',
    acionamentoMotorizado ? motorText : '#5d6873',
    acionamentoMotorizado ? motorText : undefined,
    acionamentoMotorizado ? motorStroke : '#cfd6dd',
  );
  campoInstalacaoPdf(doc, ordem.codigo, left + colW + gap, y0 + rowH * 4, colW);

  if (acionamentoMotorizado) {
    campoPdf(
      doc, 'Emissor', item.emissor ? texto(item.emissor_nome, 'Sim') : 'Não',
      left, y0 + rowH * 5, (colW - gap) / 2, 30, motorFill, motorText, motorText, motorStroke,
    );
    campoPdf(
      doc, 'Canal', texto(item.canal),
      left + (colW + gap) / 2, y0 + rowH * 5, (colW - gap) / 2, 30, motorFill, motorText, motorText, motorStroke,
    );
  }

  const compY = 424 + (acionamentoMotorizado ? rowH : 0);
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
  doc.text('Descrição', left + 98, headerY + 5, { width: descW });
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
  doc.font('Helvetica').fontSize(7).fillColor(muted).text('Conferir medidas, tecido e acessórios antes da produção.', left, 798, { width: pageW, height: 10 });
}

function campoCortinaPdf(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h = 31,
  fill = '#ffffff',
  mutedValue = false,
): void {
  doc.save().fillColor(fill).rect(x, y, w, h).fill().lineWidth(0.7).strokeColor('#cfd6dd').rect(x, y, w, h).stroke().restore();
  doc.font('Helvetica-Bold').fontSize(5.9).fillColor('#5d6873').text(label, x + 7, y + 5, { width: w - 14, height: 8 });
  doc.font('Helvetica').fontSize(8.4).fillColor(mutedValue ? '#7b858f' : '#111111').text(abreviar(value, 78), x + 7, y + 14, { width: w - 14, height: h - 15 });
}

function tecidoCamada(item: ItemProducaoSnapshot, index: number): string {
  const camada = item.camadas?.[index];
  if (camada?.tecido_nome) return camada.tecido_nome;
  const tecidos = componentesPorGrupo(item, 'Tecido');
  return tecidoSemPrefixo(descComponente(tecidos[index]));
}

function modeloCamada(item: ItemProducaoSnapshot, index: number): string {
  if (!item.camadas?.[index] && !tecidoCamada(item, index)) return '';
  return modeloCortinaLabel(item.camadas?.[index]?.modelo ?? item.tipo);
}

function desenharCabecalhoCortina(doc: PDFKit.PDFDocument, ordem: OrdemDocumento, titulo = 'Ordem de Produção'): void {
  const left = 36;
  const muted = '#5d6873';
  doc.rect(0, 0, 595, 76).fill('#f1f3f5');
  doc.fillColor('#15191d').font('Helvetica-Bold').fontSize(18).text(titulo, left, 22, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(muted).text(tipoOrdemA4(ordem), left, 48, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#15191d').text(ordem.codigo, 372, 19, { width: 187, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(muted).text(`Gerada em ${dataBR(ordem.criadoEm)}`, 372, 39, { width: 187, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(`Entrega: ${dataCurtaBR(ordem.entregaEm)}`, 372, 57, { width: 187, align: 'right' });
}

function rodapeProducao(doc: PDFKit.PDFDocument): void {
  const left = 36;
  const pageW = 523;
  doc.moveTo(left, 790).lineTo(left + pageW, 790).strokeColor('#d7dce0').stroke();
  doc.font('Helvetica').fontSize(7).fillColor('#5d6873').text('Conferir medidas, tecido e acessórios antes do corte/produção.', left, 800, { width: pageW, height: 10 });
}

function desenharTabelaComponentesCortina(
  doc: PDFKit.PDFDocument,
  ordem: OrdemDocumento,
  componentes: ComponenteSnapshot[],
  startY: number,
): void {
  const left = 36;
  const pageW = 523;
  const soft = '#f1f3f5';
  const ink = '#15191d';
  const line = '#cfd6dd';
  const headerH = 18;
  const minRowH = 16;
  const maxRowH = 44;
  const maxY = 782;
  const descW = 335;
  const qtdX = left + 438;
  const qtdW = 78;
  let y = startY;
  let page = 1;
  let tableTop = startY + 24;

  const desenharCabecalhoTabela = (titulo: string) => {
    sectionTitle(doc, titulo, left, y, pageW);
    y += 24;
    tableTop = y;
    doc.rect(left, y, pageW, headerH).fill(soft);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(ink);
    doc.text('Grupo', left + 8, y + 5, { width: 82 });
    doc.text('Descrição', left + 98, y + 5, { width: descW });
    doc.text('Qtd.', qtdX, y + 5, { width: qtdW, align: 'right' });
    doc.save().lineWidth(0.7).strokeColor(line).rect(left, y, pageW, headerH).stroke().restore();
    y += headerH;
  };

  desenharCabecalhoTabela('Componentes e materiais');

  const linhas = componentes.length > 0 ? componentes : [{ grupo: '-', descricao: 'Nenhum componente informado', quantidade: 0, unidade: '-' }];
  linhas.forEach((c) => {
    const descricao = texto(c.descricao, '');
    const grupo = texto(c.grupo, '');
    const tecido = grupo.toLowerCase() === 'tecido';
    const quantidade = c.quantidade_label ?? numero(c.quantidade);
    doc.font('Helvetica').fontSize(6.8);
    const rowH = Math.max(
      minRowH,
      Math.min(maxRowH, Math.max(
        doc.heightOfString(descricao, { width: descW }),
        doc.heightOfString(quantidade, { width: qtdW, align: 'right' }),
      ) + 8),
    );
    if (y + rowH > maxY) {
      doc.save().lineWidth(0.7).strokeColor(line).rect(left, tableTop, pageW, Math.max(headerH, maxY - tableTop)).stroke().restore();
      rodapeProducao(doc);
      doc.addPage();
      page += 1;
      desenharCabecalhoCortina(doc, ordem, 'Ordem de Produção');
      y = 98;
      desenharCabecalhoTabela(`Componentes e materiais (continuação ${page})`);
    }
    if (tecido) {
      doc.save().fillColor('#fffba6').rect(left, y, pageW, rowH).fill().restore();
    }
    doc.moveTo(left, y).lineTo(left + pageW, y).strokeColor('#e3e7eb').stroke();
    doc.font('Helvetica').fontSize(6.8).fillColor(ink);
    doc.text(abreviar(grupo, 18), left + 8, y + 4, { width: 82, height: rowH - 4 });
    doc.text(descricao, left + 98, y + 4, { width: descW, height: rowH - 4 });
    doc.text(quantidade, qtdX, y + 4, { width: qtdW, height: rowH - 4, align: 'right' });
    y += rowH;
  });
  doc.save().lineWidth(0.7).strokeColor(line).rect(left, tableTop, pageW, Math.max(headerH, y - tableTop)).stroke().restore();
  rodapeProducao(doc);
}

function desenharPdfCortina(doc: PDFKit.PDFDocument, ordem: OrdemDocumento): void {
  const item = ordem.item;
  const left = 36;
  const pageW = 523;
  const gap = 8;
  const ink = '#15191d';

  desenharCabecalhoCortina(doc, ordem);

  const metaY = 98;
  const metaW = (pageW - gap * 3) / 4;
  [
    ['Pedido', ordem.pedidoCodigo],
    ['Cliente', ordem.cliente],
    ['Vendedor', primeiroNome(ordem.vendedor)],
    ['Instalação', texto(item.instalacao_nome)],
  ].forEach(([label, value], index) => {
    campoCortinaPdf(doc, label, value, left + index * (metaW + gap), metaY, metaW, 36);
  });

  const produtoY = 150;
  sectionTitle(doc, 'Produto', left, produtoY, pageW);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(abreviar(produtoResumo(item), 112), left, produtoY + 23, { width: pageW, height: 18 });

  const dadosY = 204;
  sectionTitle(doc, 'Dados técnicos', left, dadosY, pageW);
  const y0 = dadosY + 24;
  const rowH = 36;
  const ambienteW = 260;
  const smallW = (pageW - ambienteW - gap * 2) / 2;
  const colW = (pageW - gap) / 2;
  campoCortinaPdf(doc, 'Ambiente', texto(item.ambiente), left, y0, ambienteW, 30);
  campoCortinaPdf(doc, 'Largura', `${numero(item.largura_m)} m`, left + ambienteW + gap, y0, smallW, 30);
  campoCortinaPdf(doc, 'Altura', `${numero(item.altura_m)} m`, left + ambienteW + gap + smallW + gap, y0, smallW, 30);
  campoCortinaPdf(doc, 'Cortina', tecidoCamada(item, 0), left, y0 + rowH, colW, 30);
  campoCortinaPdf(doc, 'Tipo', modeloCamada(item, 0), left + colW + gap, y0 + rowH, colW, 30);
  campoCortinaPdf(doc, 'Forro', tecidoCamada(item, 1), left, y0 + rowH * 2, colW, 30);
  campoCortinaPdf(doc, 'Tipo', modeloCamada(item, 1), left + colW + gap, y0 + rowH * 2, colW, 30);
  campoCortinaPdf(doc, 'Xale', tecidoCamada(item, 2), left, y0 + rowH * 3, colW, 30);
  campoCortinaPdf(doc, 'Tipo', modeloCamada(item, 2), left + colW + gap, y0 + rowH * 3, colW, 30);
  campoCortinaPdf(doc, 'Fixação', fixacaoCortinaLabel(item.fixacao), left, y0 + rowH * 4, pageW, 30);
  campoCortinaPdf(doc, 'Abertura', aberturaCortinaLabel(item.abertura), left, y0 + rowH * 5, colW, 30);
  campoCortinaPdf(doc, 'Desconto', descontoCortinaLabel(item.desconto), left + colW + gap, y0 + rowH * 5, colW, 30, '#fffba6');
  campoCortinaPdf(doc, 'Observações', '', left, y0 + rowH * 6, pageW, 34);

  desenharTabelaComponentesCortina(doc, ordem, item.componentes ?? [], 486);
}

export async function gerarPdfOrdemProducao(ordem: OrdemDocumento): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Ordem de Produção ${ordem.codigo}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (ehPersianaDocumento(ordem)) {
      desenharPdfPersiana(doc, ordem);
      doc.end();
      return;
    }

    if (ehCortinaDocumento(ordem)) {
      desenharPdfCortina(doc, ordem);
      doc.end();
      return;
    }

    const left = 36;
    const pageW = 523;

    doc.rect(0, 0, 595, 70).fill('#f3f5f7');
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(18).text('Ordem de Produção', left, 22, { width: 260 });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#5f6973').text(tipoOrdemA4(ordem), left, 48, { width: 260 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(ordem.codigo, 350, 20, { width: 209, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text(`Gerada em ${dataBR(ordem.criadoEm)}`, 350, 39, { width: 209, align: 'right' });

    const metaY = 88;
    const boxH = 36;
    const gap = 8;
    const boxW = (pageW - gap * 3) / 4;
    [
      ['Pedido', ordem.pedidoCodigo],
      ['Orçamento GC', ordem.orcamentoCodigo],
      ['Cliente', ordem.cliente],
      ['Tipo', tipoLabel(String(ordem.tipoProduto))],
    ].forEach(([label, value], i) => {
      const x = left + i * (boxW + gap);
      drawBox(doc, x, metaY, boxW, boxH);
      labelValue(doc, label, value, x + 8, metaY + 8, boxW - 16);
    });

    const produtoY = 142;
    sectionTitle(doc, 'Produto', left, produtoY, pageW);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(abreviar(produtoResumo(ordem.item), 96), left, produtoY + 24, { width: pageW, height: 34 });

    const dadosY = 204;
    sectionTitle(doc, 'Dados técnicos', left, dadosY, pageW);
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

    const compY = 452;
    sectionTitle(doc, 'Componentes e materiais', left, compY, pageW);
    const headerY = compY + 24;
    doc.rect(left, headerY, pageW, 20).fill('#f3f5f7');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111');
    doc.text('Grupo', left + 8, headerY + 6, { width: 84 });
    doc.text('Descrição', left + 98, headerY + 6, { width: 295 });
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
      doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text(`+ ${(ordem.item.componentes?.length ?? 0) - componentes.length} componente(s) adicional(is) no cálculo original.`, left, tableBottom + 6);
    }

    const obsY = 770;
    doc.moveTo(left, obsY - 8).lineTo(left + pageW, obsY - 8).strokeColor('#d7dce0').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text('Conferir medidas, tecido e acessórios antes do corte/produção.', left, obsY, { width: pageW });

    doc.end();
  });
}

function desenharOrdemProducao(doc: PDFKit.PDFDocument, ordem: OrdemDocumento): void {
  if (ehPersianaDocumento(ordem)) {
    desenharPdfPersiana(doc, ordem);
    return;
  }

  if (ehCortinaDocumento(ordem)) {
    desenharPdfCortina(doc, ordem);
    return;
  }

  const left = 36;
  const pageW = 523;

  doc.rect(0, 0, 595, 70).fill('#f3f5f7');
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(18).text('Ordem de Produção', left, 22, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#5f6973').text(tipoOrdemA4(ordem), left, 48, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(ordem.codigo, 350, 20, { width: 209, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text(`Gerada em ${dataBR(ordem.criadoEm)}`, 350, 39, { width: 209, align: 'right' });

  const metaY = 88;
  const boxH = 36;
  const gap = 8;
  const boxW = (pageW - gap * 3) / 4;
  [
    ['Pedido', ordem.pedidoCodigo],
    ['Orçamento GC', ordem.orcamentoCodigo],
    ['Cliente', ordem.cliente],
    ['Tipo', tipoLabel(String(ordem.tipoProduto))],
  ].forEach(([label, value], i) => {
    const x = left + i * (boxW + gap);
    drawBox(doc, x, metaY, boxW, boxH);
    labelValue(doc, label, value, x + 8, metaY + 8, boxW - 16);
  });

  const produtoY = 142;
  sectionTitle(doc, 'Produto', left, produtoY, pageW);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(abreviar(produtoResumo(ordem.item), 96), left, produtoY + 24, { width: pageW, height: 34 });

  const dadosY = 204;
  sectionTitle(doc, 'Dados técnicos', left, dadosY, pageW);
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

  const compY = 452;
  sectionTitle(doc, 'Componentes e materiais', left, compY, pageW);
  const headerY = compY + 24;
  doc.rect(left, headerY, pageW, 20).fill('#f3f5f7');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111');
  doc.text('Grupo', left + 8, headerY + 6, { width: 84 });
  doc.text('Descrição', left + 98, headerY + 6, { width: 295 });
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
    doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text(`+ ${(ordem.item.componentes?.length ?? 0) - componentes.length} componente(s) adicional(is) no cálculo original.`, left, tableBottom + 6);
  }

  const obsY = 770;
  doc.moveTo(left, obsY - 8).lineTo(left + pageW, obsY - 8).strokeColor('#d7dce0').stroke();
  doc.font('Helvetica').fontSize(8).fillColor('#5f6973').text('Conferir medidas, tecido e acessórios antes do corte/produção.', left, obsY, { width: pageW });
}

export async function gerarPdfOrdensProducao(ordens: OrdemDocumento[], titulo = 'Ordens de Produção'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: titulo } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    ordens.forEach((ordem, index) => {
      if (index > 0) doc.addPage();
      desenharOrdemProducao(doc, ordem);
    });
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
  const pedidoW = Math.round(contentW * 0.48);

  return [
    '^XA',
    '^CI28',
    `^PW${width}`,
    `^LL${height}`,
    '^LH0,0',
    zplLine(marginLeft, 12, 25, 25, pedidoW, `Pedido ${ordem.pedidoCodigo}`, 1, 24),
    zplLine(marginLeft, 42, 20, 20, contentW, `Cliente: ${ordem.cliente}`, 1, 56),
    zplLine(marginLeft, 68, 20, 20, contentW, `Amb: ${texto(item.ambiente, '')}`, 1, 58),
    zplLine(marginLeft, 94, 20, 20, contentW, produtoResumo(item), 2, 88),
    zplLine(marginLeft, 142, 17, 17, contentW, `Frente: ${frente}`, 2, 118),
    camada2 ? zplLine(marginLeft, 182, 17, 17, contentW, `Camada 2: ${camada2}`, 2, 118) : '',
    suporte ? zplLine(marginLeft, camada2 ? 226 : 208, 18, 18, contentW, suporte, 1, 96) : '',
    '^XZ',
  ].filter(Boolean).join('\n');
}

function lojaEtiqueta(v: unknown): string {
  const s = texto(v, '').toLowerCase();
  if (s.includes('filial') || s.includes('sbc')) return 'Filial';
  if (s.includes('matriz') || s.includes('sp')) return 'Matriz';
  return texto(v, '');
}

function instalacaoSimNao(v: unknown): string {
  const s = texto(v, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!s || s === '-' || s.includes('sem instalacao') || s.includes('sem instalação')) return 'Não';
  return 'Sim';
}

function fixacaoPersianaLabel(item: ItemProducaoSnapshot): string {
  if (item.fixacao_instalacao === 'teto') return 'Teto';
  if (item.fixacao_instalacao === 'parede') return 'Parede';
  const s = texto(item.instalacao_nome, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (s.includes('teto')) return 'Teto';
  if (s.includes('parede')) return 'Parede';
  return '';
}

function gerarZplEtiquetaPersiana(ordem: OrdemDocumento, width: number, height: number, marginLeft: number, marginRight: number, dotsPorMm: number): string {
  const item = ordem.item;
  const marginLeftPersiana = marginLeft + Math.round(3 * dotsPorMm);
  const contentW = width - marginLeftPersiana - marginRight;
  const produto = zplText(produtoResumo(item));
  const tecido = zplText(item.tecido_nome);
  const qrSize = Math.round(18 * dotsPorMm);
  const qrX = width - marginRight - qrSize;
  const textW = qrX - marginLeftPersiana - 12;
  const entradaEntregaW = Math.round(textW * 0.53);
  const acessorios = [
    item.acionamento ? `AC:${acionamentoLabel(item.acionamento)}` : null,
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
  // Emissor/Canal (motorizado): a etiqueta já usa quase toda a altura física (35mm,
  // a última linha existente já encosta na borda) — sem espaço pra mais uma linha.
  // Anexa (abreviado) na linha "Tipo", que é a que sobra mais largura; ^FB garante que
  // fica contido na caixa (nunca extrapola a área de impressão, só trunca se faltar
  // espaço horizontal). Só entra quando motorizado, pra não competir por espaço à toa.
  const motorizado = ehAcionamentoMotorizado(item.acionamento);
  const canalCurto = texto(item.canal, '').replace(/^Canal\s*/i, '').trim();
  const tipoValor = motorizado
    ? `${tipo}  E:${item.emissor ? 'S' : 'N'}${canalCurto ? ` C:${canalCurto}` : ''}`
    : `Tipo:${tipo}`;

  return [
    '^XA',
    '^CI28',
    `^PW${width}`,
    `^LL${height}`,
    '^LH0,0',
    zplLine(marginLeftPersiana, 10, 26, 26, textW, `Pedido ${ordem.pedidoCodigo}`, 1, 26),
    zplLine(marginLeftPersiana, 40, 19, 19, textW, `Cliente: ${ordem.cliente}`, 1, 58),
    zplLine(marginLeftPersiana, 66, 22, 22, textW, produto, 1, 62),
    zplLine(marginLeftPersiana, 96, 20, 20, entradaEntregaW, `Entrada:${entrada}`, 1, 22),
    zplLine(marginLeftPersiana + entradaEntregaW + 12, 96, 20, 20, textW - entradaEntregaW - 12, `Entrega:${entrega}`, 1, 22),
    zplLine(marginLeftPersiana, 124, 20, 20, textW, tipoValor, 1, 78),
    zplLine(marginLeftPersiana, 152, 20, 20, textW, `Tecido:${tecido}`, 2, 104),
    zplLine(marginLeftPersiana, 208, 20, 20, textW, acessorios, 1, 88),
    zplLine(marginLeftPersiana, 236, 20, 20, textW, comando, 1, 80),
    `^FO${qrX},96^BQN,2,3^FDLA,${zplText(ordem.pedidoCodigo, 50)}^FS`,
    '^XZ',
  ].join('\n');
}

function gerarZplEtiquetaEmbalagemPersiana(ordem: OrdemDocumento, width: number, height: number, marginLeft: number, marginRight: number): string {
  const item = ordem.item;
  const meta = ordem.etiquetaEmbalagem;
  if (!meta) return '';

  const extraLeft = Math.round(5 * (width / 100));
  const x = marginLeft + extraLeft;
  const y = 8;
  const w = width - x - marginRight;
  const h = height - 16;
  const rightW = 240;
  const leftW = w - rightW;
  const col1W = 290;
  const col2X = x + col1W + 15;
  const rightX = x + leftW;
  const lineX = rightX - 8;
  const midY = y + 124;
  const bottomY = y + h - 54;
  const entrega = dataCurtaBR(ordem.entregaEm);
  const medida = `L:${numero(item.largura_m)}  x  A:${numero(item.altura_m)}`;
  const ambiente = texto(item.ambiente, '');

  return [
    '^XA',
    '^CI28',
    `^PW${width}`,
    `^LL${height}`,
    '^LH0,0',
    `^FO${x},${y}^GB${w},${h},3,B,0^FS`,
    `^FO${lineX},${y}^GB3,${h},3,B,0^FS`,
    `^FO${rightX},${midY}^GB${rightW},3,3,B,0^FS`,
    zplLine(x + 14, y + 14, 29, 25, 170, 'PEDIDO:', 1, 12),
    zplLine(x + 142, y + 14, 29, 25, 135, ordem.pedidoCodigo, 1, 20),
    zplLine(col2X, y + 14, 29, 25, 90, 'LOJA:', 1, 8),
    zplLine(col2X + 92, y + 14, 29, 25, 190, lojaEtiqueta(ordem.loja), 1, 18),
    zplLine(x + 14, y + 70, 29, 25, 170, 'FIXAÇÃO:', 1, 12),
    zplLine(x + 176, y + 70, 29, 25, 120, fixacaoPersianaLabel(item), 1, 12),
    zplLine(col2X, y + 70, 24, 20, 75, 'VEND:', 1, 8),
    zplLine(col2X + 78, y + 70, 24, 20, 205, primeiroNome(ordem.vendedor), 1, 18),
    zplLine(x + 14, y + 126, 28, 24, leftW - 35, `DATA DE ENTREGA: ${entrega}`, 1, 38),
    zplLine(x + 14, y + 183, 30, 26, 245, `PEÇAS: ${meta.pecaNumero} / ${meta.pecaTotal}`, 1, 18),
    zplLine(x + 275, y + 174, 24, 21, leftW - 295, 'AMBIENTE:', 1, 12),
    zplLine(x + 275, y + 205, 22, 19, leftW - 295, ambiente, 1, 28),
    zplLine(rightX + 18, y + 18, 34, 30, rightW - 36, 'INSTALAÇÃO', 1, 12),
    zplLine(rightX + 18, y + 72, 32, 28, rightW - 36, instalacaoSimNao(item.instalacao_nome), 1, 12),
    zplLine(rightX + 18, midY + 18, 34, 30, rightW - 36, 'MEDIDA:', 1, 9),
    zplLine(rightX + 16, midY + 66, 22, 18, rightW - 32, medida, 1, 36),
    zplLine(rightX + 58, bottomY, 28, 25, rightW - 90, `S/N: ${meta.serial}`, 1, 16),
    '^XZ',
  ].join('\n');
}

function dimensoesEtiqueta(dpi: number) {
  const dotsPorMm = dpi / 25.4;
  const width = Math.round(100 * dotsPorMm);
  const height = Math.round(35 * dotsPorMm);
  const marginLeft = Math.round(4 * dotsPorMm);
  const marginRight = Math.round(3 * dotsPorMm);
  return { dotsPorMm, width, height, marginLeft, marginRight };
}

export function gerarZplEtiqueta(ordem: OrdemDocumento, dpi = 203): string {
  const { dotsPorMm, width, height, marginLeft, marginRight } = dimensoesEtiqueta(dpi);
  const item = ordem.item;
  const temCamposPersiana = Boolean(item.acionamento || item.base || item.comando || item.tc_m !== undefined);
  const ehCortina = String(ordem.tipoProduto) === 'cortina'
    || (!temCamposPersiana && componentesPorGrupo(item, 'Tecido').length > 0);
  if (ehCortina) {
    return gerarZplEtiquetaCortina(ordem, width, height, marginLeft, marginRight);
  }

  return gerarZplEtiquetaPersiana(ordem, width, height, marginLeft, marginRight, dotsPorMm);
}

export function gerarZplEtiquetasImpressao(ordem: OrdemDocumento, dpi = 203): string {
  const { dotsPorMm, width, height, marginLeft, marginRight } = dimensoesEtiqueta(dpi);
  const item = ordem.item;
  const temCamposPersiana = Boolean(item.acionamento || item.base || item.comando || item.tc_m !== undefined);
  const ehCortina = String(ordem.tipoProduto) === 'cortina'
    || (!temCamposPersiana && componentesPorGrupo(item, 'Tecido').length > 0);
  if (ehCortina) return gerarZplEtiquetaCortina(ordem, width, height, marginLeft, marginRight);

  return [
    gerarZplEtiquetaPersiana(ordem, width, height, marginLeft, marginRight, dotsPorMm),
    gerarZplEtiquetaEmbalagemPersiana(ordem, width, height, marginLeft, marginRight),
  ].filter(Boolean).join('\n');
}
