import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { listarProdutosRemoto, type GcProduto } from './catalogos';
import { GRUPO_TECIDOS_PERSIANA, GRUPO_TECIDO_CORTINA } from './tecidos';
import { GRUPOS_ACESSORIO_CORTINA } from './acessorios';
import { getCalculadoras } from '../calc/calculadoras';

const CHAVE_STATUS = 'gc_catalogo_local_status';
const CHAVE_SYNC_DIARIA = 'gc_catalogo_local_sync_diaria';
const GRUPOS_COMPONENTES_PERSIANA = ['190128', '76945', '5969405'];
const GRUPO_INSTALACAO = '5943859';

const GRUPOS_CATALOGO = [
  GRUPO_TECIDOS_PERSIANA,
  GRUPO_TECIDO_CORTINA,
  ...GRUPOS_COMPONENTES_PERSIANA,
  GRUPO_INSTALACAO,
  ...Object.values(GRUPOS_ACESSORIO_CORTINA),
];

let sincronizacaoEmAndamento: Promise<ResumoSyncCatalogo> | null = null;
let agendadorIniciado = false;

export interface StatusCatalogoLocal {
  ultima_sync_em: string | null;
  em_andamento: boolean;
  sucesso: boolean | null;
  total_produtos: number;
  grupos: number;
  erro: string | null;
}

export interface ResumoSyncCatalogo {
  inicio: string;
  fim: string;
  sucesso: boolean;
  grupos: number;
  produtos_recebidos: number;
  produtos_salvos: number;
  produtos_inativados: number;
  erro?: string;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function jsonValue(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
}

function produtoLocalParaGc(p: {
  id: string;
  nome: string;
  codigo_interno: string | null;
  ativo: boolean;
  grupo_id: string | null;
  nome_grupo: string | null;
  largura: string | null;
  valor_venda: Prisma.Decimal;
  valores: Prisma.JsonValue | null;
  atributos: Prisma.JsonValue | null;
  raw_json: Prisma.JsonValue;
}): GcProduto {
  const raw = p.raw_json && typeof p.raw_json === 'object' && !Array.isArray(p.raw_json) ? p.raw_json as Record<string, unknown> : {};
  const valores = Array.isArray(p.valores)
    ? p.valores
    : Array.isArray(raw.valores)
      ? raw.valores
      : [];
  const atributos = Array.isArray(p.atributos)
    ? p.atributos
    : Array.isArray(raw.atributos)
      ? raw.atributos
      : [];
  return {
    id: p.id,
    nome: p.nome,
    codigo_interno: p.codigo_interno ?? '',
    ativo: p.ativo ? '1' : '0',
    grupo_id: p.grupo_id ?? '',
    nome_grupo: p.nome_grupo ?? '',
    largura: p.largura ?? '',
    valor_venda: p.valor_venda.toString(),
    valores: valores as unknown as GcProduto['valores'],
    atributos: atributos as unknown as GcProduto['atributos'],
  };
}

async function salvarStatus(status: StatusCatalogoLocal): Promise<void> {
  await prisma.configuracao.upsert({
    where: { chave: CHAVE_STATUS },
    create: {
      chave: CHAVE_STATUS,
      valor: JSON.stringify(status),
      descricao: 'Status da sincronização local de produtos do GestãoClick',
    },
    update: { valor: JSON.stringify(status) },
  });
}

export async function statusCatalogoLocal(): Promise<StatusCatalogoLocal> {
  const [config, total] = await Promise.all([
    prisma.configuracao.findUnique({ where: { chave: CHAVE_STATUS } }),
    prisma.gcProdutoLocal.count(),
  ]);
  const base: StatusCatalogoLocal = {
    ultima_sync_em: null,
    em_andamento: Boolean(sincronizacaoEmAndamento),
    sucesso: null,
    total_produtos: total,
    grupos: gruposCatalogo().length,
    erro: null,
  };
  if (!config?.valor) return base;
  try {
    return { ...base, ...JSON.parse(config.valor), em_andamento: Boolean(sincronizacaoEmAndamento), total_produtos: total, grupos: base.grupos };
  } catch {
    return base;
  }
}

export async function listarProdutosLocais(filtros: { grupo_id?: string; ativo?: 0 | 1 } = {}): Promise<GcProduto[] | null> {
  const total = await prisma.gcProdutoLocal.count();
  if (total === 0) return null;

  const produtos = await prisma.gcProdutoLocal.findMany({
    where: {
      ...(filtros.grupo_id ? { grupo_id: String(filtros.grupo_id) } : {}),
      ...(filtros.ativo !== undefined ? { ativo: filtros.ativo === 1 } : {}),
    },
    orderBy: { nome: 'asc' },
  });
  return produtos.map(produtoLocalParaGc);
}

async function executarSync(): Promise<ResumoSyncCatalogo> {
  const inicioDate = new Date();
  const inicio = inicioDate.toISOString();
  const grupos = gruposCatalogo();
  await salvarStatus({
    ultima_sync_em: null,
    em_andamento: true,
    sucesso: null,
    total_produtos: await prisma.gcProdutoLocal.count(),
    grupos: grupos.length,
    erro: null,
  });

  try {
    const porId = new Map<string, GcProduto>();
    for (const grupoId of grupos) {
      const produtos = await listarProdutosRemoto({ grupo_id: grupoId, ativo: 1 });
      for (const produto of produtos) porId.set(String(produto.id), produto);
    }

    const agora = new Date();
    let salvos = 0;
    for (const p of porId.values()) {
      await prisma.gcProdutoLocal.upsert({
        where: { id: String(p.id) },
        create: {
          id: String(p.id),
          nome: p.nome,
          codigo_interno: String(p.codigo_interno ?? '').trim() || null,
          ativo: String(p.ativo) !== '0',
          grupo_id: String(p.grupo_id ?? '') || null,
          nome_grupo: p.nome_grupo || null,
          largura: String(p.largura ?? '') || null,
          valor_venda: new Prisma.Decimal(Number(p.valor_venda) || 0),
          valores: jsonValue(p.valores ?? []),
          atributos: jsonValue(p.atributos ?? []),
          raw_json: jsonValue(p),
          sincronizado_em: agora,
        },
        update: {
          nome: p.nome,
          codigo_interno: String(p.codigo_interno ?? '').trim() || null,
          ativo: String(p.ativo) !== '0',
          grupo_id: String(p.grupo_id ?? '') || null,
          nome_grupo: p.nome_grupo || null,
          largura: String(p.largura ?? '') || null,
          valor_venda: new Prisma.Decimal(Number(p.valor_venda) || 0),
          valores: jsonValue(p.valores ?? []),
          atributos: jsonValue(p.atributos ?? []),
          raw_json: jsonValue(p),
          sincronizado_em: agora,
        },
      });
      salvos += 1;
    }

    const inativados = await prisma.gcProdutoLocal.updateMany({
      where: { sincronizado_em: { lt: agora }, grupo_id: { in: grupos } },
      data: { ativo: false, sincronizado_em: agora },
    });

    const resumo: ResumoSyncCatalogo = {
      inicio,
      fim: new Date().toISOString(),
      sucesso: true,
      grupos: grupos.length,
      produtos_recebidos: porId.size,
      produtos_salvos: salvos,
      produtos_inativados: inativados.count,
    };
    await salvarStatus({
      ultima_sync_em: resumo.fim,
      em_andamento: false,
      sucesso: true,
      total_produtos: await prisma.gcProdutoLocal.count(),
      grupos: grupos.length,
      erro: null,
    });
    return resumo;
  } catch (err) {
    const resumo: ResumoSyncCatalogo = {
      inicio,
      fim: new Date().toISOString(),
      sucesso: false,
      grupos: grupos.length,
      produtos_recebidos: 0,
      produtos_salvos: 0,
      produtos_inativados: 0,
      erro: err instanceof Error ? err.message : 'Falha ao sincronizar catálogo.',
    };
    await salvarStatus({
      ultima_sync_em: null,
      em_andamento: false,
      sucesso: false,
      total_produtos: await prisma.gcProdutoLocal.count(),
      grupos: grupos.length,
      erro: resumo.erro ?? null,
    });
    return resumo;
  }
}

function gruposCatalogo(): string[] {
  const gruposCalculadoras = getCalculadoras().flatMap((c) => c.tecido_grupo_ids ?? []);
  return unique([...GRUPOS_CATALOGO, ...gruposCalculadoras].map(String).map((g) => g.trim()).filter(Boolean));
}

export function sincronizarCatalogoLocal(): Promise<ResumoSyncCatalogo> {
  if (!sincronizacaoEmAndamento) {
    sincronizacaoEmAndamento = executarSync().finally(() => {
      sincronizacaoEmAndamento = null;
    });
  }
  return sincronizacaoEmAndamento;
}

function dataLocalSaoPaulo(d = new Date()): { data: string; hora: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => partes.find((p) => p.type === type)?.value ?? '';
  return { data: `${get('year')}-${get('month')}-${get('day')}`, hora: Number(get('hour')) };
}

async function sincronizarSeMeiaNoite(): Promise<void> {
  const local = dataLocalSaoPaulo();
  if (local.hora !== 0) return;
  const config = await prisma.configuracao.findUnique({ where: { chave: CHAVE_SYNC_DIARIA } });
  if (config?.valor === local.data) return;
  const resumo = await sincronizarCatalogoLocal();
  if (resumo.sucesso) {
    await prisma.configuracao.upsert({
      where: { chave: CHAVE_SYNC_DIARIA },
      create: { chave: CHAVE_SYNC_DIARIA, valor: local.data, descricao: 'Último dia da sincronização diária do catálogo GC' },
      update: { valor: local.data },
    });
  }
}

export function iniciarAgendadorCatalogoLocal(): void {
  if (agendadorIniciado) return;
  agendadorIniciado = true;
  setInterval(() => {
    void sincronizarSeMeiaNoite();
  }, 15 * 60 * 1000).unref();
  void sincronizarSeMeiaNoite();
}
