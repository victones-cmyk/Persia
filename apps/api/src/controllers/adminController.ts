// apps/api/src/controllers/adminController.ts
// Telas administrativas (somente admin): usuários, configurações, log de ações.

import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { listarFuncionarios } from '../services/gc/catalogos';

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------
const USUARIO_SELECT = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  loja_id: true,
  gc_usuario_id: true,
  desconto_max_pct: true,
  ativo: true,
  senha_provisoria: true,
  loja: { select: { id: true, nome: true } },
} as const;

export async function listarUsuarios(_req: Request, res: Response): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    select: USUARIO_SELECT,
    orderBy: { nome: 'asc' },
  });
  const lojas = await prisma.loja.findMany({ select: { id: true, nome: true } });
  res.json({ usuarios, lojas });
}

/**
 * Lista os funcionários (vendedores) do GestãoClick para o seletor "Vendedor GC".
 * Retorna só os ativos, ordenados por nome. Se o GC estiver indisponível, devolve
 * lista vazia + flag gc_offline (o frontend cai para o campo de texto manual).
 */
export async function listarFuncionariosGc(_req: Request, res: Response): Promise<void> {
  try {
    const todos = await listarFuncionarios();
    const funcionarios = todos
      .filter((f) => String(f.ativo) === '1')
      .map((f) => ({ id: f.id, nome: f.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    res.json({ funcionarios, gc_offline: false });
  } catch {
    res.json({ funcionarios: [], gc_offline: true });
  }
}

export async function criarUsuario(req: Request, res: Response): Promise<void> {
  const b = req.body ?? {};
  if (!b.nome || !b.email || !b.senha) {
    throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Nome, email e senha são obrigatórios.');
  }
  if (String(b.senha).length < 6) {
    throw new AppError(400, 'SENHA_CURTA', 'A senha deve ter ao menos 6 caracteres.');
  }
  const existe = await prisma.usuario.findUnique({ where: { email: String(b.email).toLowerCase().trim() } });
  if (existe) throw new AppError(409, 'EMAIL_EXISTENTE', 'Já existe um usuário com este e-mail.');

  const usuario = await prisma.usuario.create({
    data: {
      nome: String(b.nome),
      email: String(b.email).toLowerCase().trim(),
      senha_hash: bcrypt.hashSync(String(b.senha), 10),
      perfil: b.perfil === 'admin' ? 'admin' : 'vendedor',
      loja_id: b.loja_id || null,
      gc_usuario_id: b.gc_usuario_id || null,
      desconto_max_pct: b.desconto_max_pct !== undefined ? Number(b.desconto_max_pct) : 10,
      // Senha definida pelo admin é provisória — o usuário troca no primeiro acesso.
      senha_provisoria: true,
    },
    select: USUARIO_SELECT,
  });
  res.status(201).json({ usuario });
}

export async function editarUsuario(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const b = req.body ?? {};
  const existe = await prisma.usuario.findUnique({ where: { id } });
  if (!existe) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  const data: Record<string, unknown> = {};
  if (b.nome !== undefined) data.nome = String(b.nome);
  if (b.perfil !== undefined) data.perfil = b.perfil === 'admin' ? 'admin' : 'vendedor';
  if (b.loja_id !== undefined) data.loja_id = b.loja_id || null;
  if (b.gc_usuario_id !== undefined) data.gc_usuario_id = b.gc_usuario_id || null;
  if (b.desconto_max_pct !== undefined) data.desconto_max_pct = Number(b.desconto_max_pct);
  if (b.ativo !== undefined) data.ativo = Boolean(b.ativo);
  if (b.senha) {
    if (String(b.senha).length < 6) throw new AppError(400, 'SENHA_CURTA', 'Senha muito curta.');
    data.senha_hash = bcrypt.hashSync(String(b.senha), 10);
    // Reset de senha pelo admin → provisória; o usuário deve trocá-la no próximo login.
    data.senha_provisoria = true;
  }

  const usuario = await prisma.usuario.update({ where: { id }, data, select: USUARIO_SELECT });
  res.json({ usuario });
}

export async function desativarUsuario(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const sessao = req.session.usuario!;
  if (id === sessao.id) throw new AppError(400, 'AUTO_DESATIVACAO', 'Você não pode desativar a si mesmo.');
  const existe = await prisma.usuario.findUnique({ where: { id } });
  if (!existe) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  const usuario = await prisma.usuario.update({ where: { id }, data: { ativo: false }, select: USUARIO_SELECT });
  res.json({ usuario });
}

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
export async function listarConfiguracoes(_req: Request, res: Response): Promise<void> {
  const configuracoes = await prisma.configuracao.findMany({ orderBy: { chave: 'asc' } });
  res.json({ configuracoes });
}

export async function salvarConfiguracoes(req: Request, res: Response): Promise<void> {
  const itens = Array.isArray(req.body?.configuracoes) ? req.body.configuracoes : [];
  for (const c of itens) {
    if (!c?.chave) continue;
    await prisma.configuracao.upsert({
      where: { chave: String(c.chave) },
      update: { valor: String(c.valor ?? '') },
      create: { chave: String(c.chave), valor: String(c.valor ?? ''), descricao: c.descricao ?? null },
    });
  }
  const configuracoes = await prisma.configuracao.findMany({ orderBy: { chave: 'asc' } });
  res.json({ configuracoes });
}

// ---------------------------------------------------------------------------
// Log de ações
// ---------------------------------------------------------------------------
export async function listarLogAcoes(req: Request, res: Response): Promise<void> {
  const pagina = Math.max(1, Number(req.query.pagina ?? 1));
  const porPagina = 20;
  const [total, logs] = await Promise.all([
    prisma.logAcao.count(),
    prisma.logAcao.findMany({
      orderBy: { criado_em: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      include: { usuario: { select: { nome: true } } },
    }),
  ]);
  res.json({
    logs,
    paginacao: { pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) },
  });
}
