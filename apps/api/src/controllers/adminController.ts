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
  // Login (campo email) é editável pelo admin; normaliza e garante unicidade.
  if (b.email !== undefined) {
    const novoLogin = String(b.email).toLowerCase().trim();
    if (!novoLogin) throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'O usuário (login) não pode ficar vazio.');
    if (novoLogin !== existe.email) {
      const dup = await prisma.usuario.findUnique({ where: { email: novoLogin } });
      if (dup) throw new AppError(409, 'EMAIL_EXISTENTE', 'Já existe um usuário com este login.');
      data.email = novoLogin;
    }
  }
  if (b.perfil !== undefined) data.perfil = b.perfil === 'admin' ? 'admin' : 'vendedor';
  if (b.loja_id !== undefined) data.loja_id = b.loja_id || null;
  if (b.gc_usuario_id !== undefined) data.gc_usuario_id = b.gc_usuario_id || null;
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

/** Exclui DEFINITIVAMENTE um usuário — só se não tiver orçamentos (senão, desative). */
export async function excluirUsuario(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const sessao = req.session.usuario!;
  if (id === sessao.id) throw new AppError(400, 'AUTO_EXCLUSAO', 'Você não pode excluir a si mesmo.');
  const existe = await prisma.usuario.findUnique({ where: { id } });
  if (!existe) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  // Orçamentos referenciam o vendedor — não dá para excluir sem perder histórico.
  const orcamentos = await prisma.orcamento.count({ where: { usuario_id: id } });
  if (orcamentos > 0) {
    throw new AppError(409, 'USUARIO_COM_ORCAMENTOS', `Este usuário tem ${orcamentos} orçamento(s) e não pode ser excluído. Desative-o em vez de excluir.`);
  }

  // Sem orçamentos: limpa vínculos residuais (aprovações antigas, log de ações) e exclui.
  await prisma.$transaction([
    prisma.orcamento.updateMany({ where: { desconto_aprovado_por: id }, data: { desconto_aprovado_por: null } }),
    prisma.logAcao.deleteMany({ where: { usuario_id: id } }),
    prisma.usuario.delete({ where: { id } }),
  ]);
  res.json({ ok: true });
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
