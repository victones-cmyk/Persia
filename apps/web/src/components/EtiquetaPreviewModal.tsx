import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint } from '@fortawesome/free-solid-svg-icons';
import type { ReactNode } from 'react';

interface PreviewItem {
  ambiente?: string;
  tipo?: string;
  tecido_nome?: string;
  largura_m?: number;
  altura_m?: number;
  tc_m?: number;
  acionamento?: string | null;
  cor_acessorio?: string | null;
  rolamento?: string | null;
  base?: string | null;
  comando?: string | null;
  fixacao_instalacao?: string | null;
  instalacao_nome?: string | null;
  fixacao?: string | null;
  nome_produto?: string;
  etiqueta_embalagem_serial?: number;
  emendas?: number;
  lado_motor?: string;
  tipo_abertura?: string;
  qtd_producao?: number;
  componentes?: Array<{ grupo?: string; descricao?: string; quantidade?: number; unidade?: string }>;
}

export interface EtiquetaPreviewOrdem {
  id: string;
  codigo: string;
  gc_pedido_codigo: string;
  tipo_documento?: 'persiana' | 'cortina' | 'trilho';
  tipo_produto?: string;
  item_snapshot_json?: PreviewItem;
  orcamento?: {
    nome_cliente?: string | null;
    pedido_entrega_em?: string | null;
    loja_nome?: string | null;
    vendedor_nome?: string | null;
  };
}

function texto(v: unknown, fallback = '-'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function primeiroNome(v: unknown): string {
  return texto(v, '').trim().split(/\s+/)[0] || '-';
}

function numero(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataBR(v: unknown): string {
  if (!v) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(String(v)));
}

function produtoResumo(item?: PreviewItem): string {
  return texto(item?.nome_produto || item?.tipo, 'Produto');
}

function tipoPersiana(v: unknown): string {
  const s = texto(v, 'Persiana');
  return s.replace(/^persiana[_\s-]*/i, 'Persiana ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function componentesPorGrupo(item: PreviewItem | undefined, grupo: string) {
  return (item?.componentes ?? []).filter((c) => texto(c.grupo, '').toLowerCase() === grupo.toLowerCase());
}

function tecidoSemPrefixo(v: string): string {
  return v.replace(/^(frente|camada\s*\d+)\s*:\s*/i, '').trim();
}

function suporteCortina(item: PreviewItem | undefined): string {
  const suporte = (item?.componentes ?? []).find((c) => {
    const d = texto(c.descricao, '').toLowerCase();
    return d.includes('trilho') || d.includes('varao') || d.includes('varão') || d.includes('suico') || d.includes('suiço');
  });
  if (!suporte) return '';
  const qtd = Number(suporte.quantidade);
  return `${texto(suporte.descricao, '')}${Number.isFinite(qtd) && qtd > 0 ? ` - ${numero(qtd)} ${texto(suporte.unidade, 'm')}` : ''}`;
}

function lojaLabel(v: unknown): string {
  const s = texto(v, '').toLowerCase();
  if (s.includes('filial') || s.includes('sbc')) return 'Filial';
  if (s.includes('matriz') || s.includes('sp')) return 'Matriz';
  return texto(v, '');
}

function fixacaoLabel(item?: PreviewItem): string {
  if (item?.fixacao_instalacao === 'teto') return 'Teto';
  if (item?.fixacao_instalacao === 'parede') return 'Parede';
  const s = texto(item?.instalacao_nome, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (s.includes('teto')) return 'Teto';
  if (s.includes('parede')) return 'Parede';
  return '';
}

function instalacaoSimNao(v: unknown): string {
  const s = texto(v, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!s || s === '-' || s.includes('sem instalacao') || s.includes('sem instalação')) return 'Não';
  return 'Sim';
}

function acionamentoLabel(v: unknown): string {
  const s = texto(v, '');
  const labels: Record<string, string> = {
    com_bando: 'Com Bandô',
    com_barra: 'Com Barra Estabilizadora',
    motorizado_com_bando: 'Motorizado com Bandô',
    motorizado_sem_bando: 'Motorizado sem Bandô',
  };
  return labels[s] ?? s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

function Linha({ children, forte = false }: { children: ReactNode; forte?: boolean }) {
  return (
    <div
      style={{
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: forte ? 700 : 400,
      }}
    >
      {children}
    </div>
  );
}

function EtiquetaProduto({ ordem }: { ordem: EtiquetaPreviewOrdem }) {
  const item = ordem.item_snapshot_json;
  const tipo = ordem.tipo_documento ?? 'persiana';
  const tecidos = componentesPorGrupo(item, 'Tecido');
  const frente = tecidoSemPrefixo(texto(tecidos[0]?.descricao, ''));
  const camada2 = tecidoSemPrefixo(texto(tecidos[1]?.descricao, ''));
  const suporte = suporteCortina(item);
  const acessorios = [
    item?.acionamento ? `AC:${acionamentoLabel(item.acionamento)}` : null,
    item?.cor_acessorio ? `cor ${item.cor_acessorio}` : null,
    item?.base ? `Base ${item.base}` : null,
  ].filter(Boolean).join(' ');
  const comando = [
    item?.tc_m !== undefined ? `TC:${numero(item.tc_m)}m` : null,
    item?.comando ? `Comando:${item.comando}` : null,
    item?.rolamento ? `Rol:${item.rolamento}` : null,
  ].filter(Boolean).join('  ');

  const motor = [
    item?.tc_m !== undefined && item.tc_m > 0 ? `TC:${numero(item.tc_m)}m` : null,
    item?.lado_motor ? `Motor:${item.lado_motor}` : null,
    item?.tipo_abertura ? `Abertura:${item.tipo_abertura}` : null,
  ].filter(Boolean).join('  ');

  return (
    <div className="card" style={{ width: 520, maxWidth: '100%', padding: 10, background: '#fff' }}>
      <div className="font-mono text-2xs-ui text-neutral-500 mb-1">Etiqueta principal · {tipo === 'persiana' ? 'Persiana' : tipo === 'trilho' ? 'Trilho especial' : 'Cortina'}</div>
      <div style={{ border: '2px solid #111', height: 182, padding: 8, display: 'grid', gap: 3, fontFamily: 'Arial, sans-serif', fontSize: 12, lineHeight: 1.15 }}>
        <Linha forte>Pedido {ordem.gc_pedido_codigo}</Linha>
        <Linha>Cliente: {ordem.orcamento?.nome_cliente}</Linha>
        {tipo === 'cortina' ? (
          <>
            <Linha>Amb: {item?.ambiente}</Linha>
            <Linha forte>{produtoResumo(item)}</Linha>
            <Linha>Frente: {frente}</Linha>
            {camada2 && <Linha>Camada 2: {camada2}</Linha>}
            {suporte && <Linha forte>{suporte}</Linha>}
          </>
        ) : tipo === 'trilho' ? (
          <>
            <Linha>Amb: {item?.ambiente}</Linha>
            <Linha forte>{produtoResumo(item)}</Linha>
            <Linha>L:{numero(item?.largura_m)}m  Qtd:{item?.qtd_producao ?? '-'}  Emendas:{item?.emendas ?? '-'}</Linha>
            {motor && <Linha>{motor}</Linha>}
          </>
        ) : (
          <>
            <Linha forte>{produtoResumo(item)}</Linha>
            <Linha>Entrada: hoje · Entrega: {dataBR(ordem.orcamento?.pedido_entrega_em)}</Linha>
            <Linha>Tipo: {tipoPersiana(item?.tipo || ordem.tipo_produto)}</Linha>
            <Linha>Tecido: {item?.tecido_nome}</Linha>
            <Linha>{acessorios}</Linha>
            <Linha>{comando}</Linha>
          </>
        )}
      </div>
    </div>
  );
}

function EtiquetaEmbalagem({ ordem }: { ordem: EtiquetaPreviewOrdem }) {
  const item = ordem.item_snapshot_json;
  const serial = item?.etiqueta_embalagem_serial ? String(item.etiqueta_embalagem_serial) : 'gerado ao imprimir';
  return (
    <div className="card" style={{ width: 520, maxWidth: '100%', padding: 10, background: '#fff' }}>
      <div className="font-mono text-2xs-ui text-neutral-500 mb-1">Etiqueta de embalagem · Persiana</div>
      <div style={{ border: '2px solid #111', height: 182, display: 'grid', gridTemplateColumns: '1fr 160px', fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.15 }}>
        <div style={{ padding: 9, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <Linha forte>PEDIDO: {ordem.gc_pedido_codigo}</Linha>
          <Linha>LOJA: {lojaLabel(ordem.orcamento?.loja_nome)}</Linha>
          <Linha>FIXAÇÃO: {fixacaoLabel(item)}</Linha>
          <Linha>VEND: {primeiroNome(ordem.orcamento?.vendedor_nome)}</Linha>
          <div style={{ gridColumn: '1 / -1' }}><Linha forte>DATA DE ENTREGA: {dataBR(ordem.orcamento?.pedido_entrega_em)}</Linha></div>
          <Linha forte>PEÇAS: 1 / 1</Linha>
          <Linha>AMBIENTE: {item?.ambiente}</Linha>
        </div>
        <div style={{ borderLeft: '2px solid #111', display: 'grid', gridTemplateRows: '1fr 1fr 38px' }}>
          <div style={{ padding: 10 }}><Linha forte>INSTALAÇÃO</Linha><Linha>{instalacaoSimNao(item?.instalacao_nome)}</Linha></div>
          <div style={{ padding: 10, borderTop: '2px solid #111' }}><Linha forte>MEDIDA:</Linha><Linha>L:{numero(item?.largura_m)} x A:{numero(item?.altura_m)}</Linha></div>
          <div style={{ padding: 8 }}><Linha>S/N: {serial}</Linha></div>
        </div>
      </div>
    </div>
  );
}

export function EtiquetaPreviewModal({
  ordem,
  imprimindo,
  onImprimir,
  onFechar,
}: {
  ordem: EtiquetaPreviewOrdem | null;
  imprimindo?: boolean;
  onImprimir?: (ordem: EtiquetaPreviewOrdem) => void;
  onFechar: () => void;
}) {
  if (!ordem) return null;
  const tipo = ordem.tipo_documento ?? 'persiana';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => {
        e.stopPropagation();
        onFechar();
      }}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, padding: 16, width: 'min(760px, calc(100vw - 32px))', maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-modal)', zIndex: 400 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-lg-ui font-bold">Prévia da etiqueta</div>
            <div className="text-sm-ui text-neutral-600">
              {ordem.codigo} · {ordem.orcamento?.nome_cliente}
            </div>
          </div>
          <button type="button" className="btn btn-default btn-xs" onClick={onFechar}>Fechar</button>
        </div>
        <div className="alert alert-info mb-3">
          Prévia visual para conferir campos longos. A impressora pode variar fonte e quebra conforme calibração.
        </div>
        <div className="flex flex-wrap gap-3">
          <EtiquetaProduto ordem={ordem} />
          {tipo === 'persiana' && <EtiquetaEmbalagem ordem={ordem} />}
        </div>
        {onImprimir && (
          <div className="flex justify-end mt-4">
            <button type="button" className="btn btn-success" disabled={imprimindo} onClick={() => onImprimir(ordem)}>
              <FontAwesomeIcon icon={faPrint} /> {imprimindo ? 'Imprimindo...' : 'Imprimir etiqueta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
