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
  catalogo_completo: boolean;
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

export interface DiagnosticoProdutoLocal {
  id: string;
  nome: string;
  codigo_interno: string | null;
  grupo_id: string | null;
  nome_grupo: string | null;
  ativo: boolean;
  valor_venda: string;
  preco_varejo: number;
  custo_varejo: number;
  grupos_sync: string[];
  valores: { tipo_id?: unknown; nome_tipo?: unknown; valor_venda?: unknown; valor_custo?: unknown }[];
  sincronizado_em: string;
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
    catalogo_completo: false,
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
      ...(filtros.ativo !== undefined ? { ativo: filtros.ativo === 1 } : {}),
    },
    orderBy: { nome: 'asc' },
  });
  const grupoFiltro = filtros.grupo_id ? String(filtros.grupo_id) : null;
  const filtrados = grupoFiltro
    ? produtos.filter((p) => p.grupo_id === grupoFiltro || gruposSyncDoRaw(p.raw_json).includes(grupoFiltro))
    : produtos;
  return filtrados.map(produtoLocalParaGc);
}

function precoVarejoLocal(produto: { valor_venda: Prisma.Decimal; valores: Prisma.JsonValue | null }): { preco: number; custo: number } {
  const valores = Array.isArray(produto.valores) ? produto.valores as Record<string, unknown>[] : [];
  const varejo = valores.find((v) => String(v.tipo_id ?? '') === '10969' || String(v.nome_tipo ?? '').toUpperCase() === 'VAREJO');
  const preco = Number(varejo?.valor_venda ?? produto.valor_venda ?? 0);
  const custo = Number(varejo?.valor_custo ?? 0);
  return {
    preco: Number.isFinite(preco) ? preco : 0,
    custo: Number.isFinite(custo) ? custo : 0,
  };
}

export async function diagnosticarProdutoLocal(codigo: string): Promise<DiagnosticoProdutoLocal[]> {
  const q = String(codigo ?? '').trim();
  if (!q) return [];
  const produtos = await prisma.gcProdutoLocal.findMany({
    where: { OR: [{ codigo_interno: q }, { id: q }] },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });
  return produtos.map((p) => {
    const valores = Array.isArray(p.valores) ? p.valores as Record<string, unknown>[] : [];
    const preco = precoVarejoLocal(p);
    return {
      id: p.id,
      nome: p.nome,
      codigo_interno: p.codigo_interno,
      grupo_id: p.grupo_id,
      nome_grupo: p.nome_grupo,
      ativo: p.ativo,
      valor_venda: p.valor_venda.toString(),
      preco_varejo: preco.preco,
      custo_varejo: preco.custo,
      grupos_sync: gruposSyncDoRaw(p.raw_json),
      valores: valores.map((v) => ({
        tipo_id: v.tipo_id,
        nome_tipo: v.nome_tipo,
        valor_venda: v.valor_venda,
        valor_custo: v.valor_custo,
      })),
      sincronizado_em: p.sincronizado_em.toISOString(),
    };
  });
}

async function executarSync(): Promise<ResumoSyncCatalogo> {
  const inicioDate = new Date();
  const inicio = inicioDate.toISOString();
  const grupos = gruposCatalogo();
  const statusAnterior = await statusCatalogoLocal();
  await salvarStatus({
    ultima_sync_em: null,
    em_andamento: true,
    sucesso: null,
    catalogo_completo: statusAnterior.catalogo_completo,
    total_produtos: await prisma.gcProdutoLocal.count(),
    grupos: grupos.length,
    erro: null,
  });

  try {
    const porId = new Map<string, GcProduto>();
    const gruposPorProduto = new Map<string, Set<string>>();

    // O catálogo completo abastece produtos avulsos e também serve de base para
    // todos os cálculos. As consultas por grupo abaixo preservam o vínculo com
    // grupos-pai retornado pelo GestãoClick para os filtros das calculadoras.
    const todosProdutos = await listarProdutosRemoto({ ativo: 1 });
    for (const produto of todosProdutos) {
      porId.set(String(produto.id), produto);
    }
    for (const grupoId of grupos) {
      const produtos = await listarProdutosRemoto({ grupo_id: grupoId, ativo: 1 });
      for (const produto of produtos) {
        const id = String(produto.id);
        porId.set(id, produto);
        if (!gruposPorProduto.has(id)) gruposPorProduto.set(id, new Set());
        gruposPorProduto.get(id)!.add(grupoId);
      }
    }

    const agora = new Date();
    let salvos = 0;
    const produtosCatalogo = [...porId.values()];
    const tamanhoLote = 10;
    for (let inicioLote = 0; inicioLote < produtosCatalogo.length; inicioLote += tamanhoLote) {
      const lote = produtosCatalogo.slice(inicioLote, inicioLote + tamanhoLote);
      await Promise.all(lote.map(async (p) => {
        const gruposSync = [...(gruposPorProduto.get(String(p.id)) ?? new Set<string>())];
        const rawComSync = { ...p, __catalogo_grupo_ids: gruposSync };
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
            raw_json: jsonValue(rawComSync),
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
            raw_json: jsonValue(rawComSync),
            sincronizado_em: agora,
          },
        });
      }));
      salvos += lote.length;
    }

    const inativados = await prisma.gcProdutoLocal.updateMany({
      // Como a primeira consulta representa TODOS os produtos ativos, qualquer
      // registro não visto nesta execução deixou de estar ativo no catálogo.
      where: { sincronizado_em: { lt: agora } },
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
      catalogo_completo: true,
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
      catalogo_completo: statusAnterior.catalogo_completo,
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

function gruposSyncDoRaw(rawJson: Prisma.JsonValue): string[] {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) return [];
  const raw = rawJson as Record<string, unknown>;
  return Array.isArray(raw.__catalogo_grupo_ids) ? raw.__catalogo_grupo_ids.map(String) : [];
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

async function sincronizarCatalogoCompletoAoIniciar(): Promise<void> {
  const status = await statusCatalogoLocal();
  if (status.catalogo_completo) {
    await sincronizarSeMeiaNoite();
    return;
  }

  const resumo = await sincronizarCatalogoLocal();
  if (resumo.sucesso) {
    const local = dataLocalSaoPaulo();
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
  // Versões antigas armazenavam apenas os grupos técnicos. Após o deploy desta
  // versão, a primeira inicialização completa o catálogo automaticamente.
  void sincronizarCatalogoCompletoAoIniciar();
}
