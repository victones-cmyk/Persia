// apps/api/src/controllers/adminController.ts
// Telas administrativas (somente admin): usuários, configurações, log de ações.

import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { validarSenha } from '../lib/senha';
import { listarFuncionarios } from '../services/gc/catalogos';
import { getRegras, salvarRegras, REGRAS_DEFAULT } from '../services/calc/regras';
import { composicaoCalculo } from '../services/calc/composicao';

// ---------------------------------------------------------------------------
// Versão em produção (só admin) — usado para conferir o auto-deploy do Railway.
// Movido para cá (era público em /api/health) para não expor a versão a terceiros.
// ---------------------------------------------------------------------------
export async function getVersao(_req: Request, res: Response): Promise<void> {
  res.json({ commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null, timestamp: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Regras de cálculo (parametrização do motor — só admin)
// ---------------------------------------------------------------------------
export async function getRegrasCalculo(_req: Request, res: Response): Promise<void> {
  // composicao: quais produtos do GC entram em cada cálculo (para o admin saber, ao
  // mudar um preço no GC, onde isso influencia a calculadora). Cálculo puro/local.
  res.json({ regras: getRegras(), padrao: REGRAS_DEFAULT, composicao: composicaoCalculo() });
}

export async function salvarRegrasCalculo(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
  const regras = await salvarRegras(prisma, (req.body?.regras ?? req.body));
  await prisma.logAcao.create({
    data: { usuario_id: sessao.id, acao: 'regras_calculo_atualizadas', detalhe: {} },
  });
  res.json({ regras });
}

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
  const sessao = req.session.usuario!;
  const b = req.body ?? {};
  if (!b.nome || !b.email || !b.senha) {
    throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Nome, email e senha são obrigatórios.');
  }
  const erroSenhaCriar = validarSenha(b.senha);
  if (erroSenhaCriar) {
    throw new AppError(400, 'SENHA_FRACA', erroSenhaCriar);
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
  // Auditoria: criação de usuário (sem senha/hash no detalhe).
  await prisma.logAcao.create({
    data: { usuario_id: sessao.id, acao: 'usuario_criado', detalhe: { usuario_alvo_id: usuario.id, email: usuario.email, perfil: usuario.perfil } },
  });
  res.status(201).json({ usuario });
}

export async function editarUsuario(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario!;
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
    const erroSenhaEditar = validarSenha(b.senha);
    if (erroSenhaEditar) throw new AppError(400, 'SENHA_FRACA', erroSenhaEditar);
    data.senha_hash = bcrypt.hashSync(String(b.senha), 10);
    // Reset de senha pelo admin → provisória; o usuário deve trocá-la no próximo login.
    data.senha_provisoria = true;
  }

  const usuario = await prisma.usuario.update({ where: { id }, data, select: USUARIO_SELECT });
  // Auditoria: edição de usuário; sinaliza ações sensíveis (mudança de perfil, reset de senha).
  await prisma.logAcao.create({
    data: {
      usuario_id: sessao.id,
      acao: 'usuario_editado',
      detalhe: {
        usuario_alvo_id: id,
        perfil_alterado: data.perfil !== undefined && data.perfil !== existe.perfil ? String(data.perfil) : undefined,
        senha_resetada: data.senha_hash !== undefined ? true : undefined,
        login_alterado: data.email !== undefined ? true : undefined,
        ativo: b.ativo !== undefined ? Boolean(b.ativo) : undefined,
      },
    },
  });
  res.json({ usuario });
}

export async function desativarUsuario(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const sessao = req.session.usuario!;
  if (id === sessao.id) throw new AppError(400, 'AUTO_DESATIVACAO', 'Você não pode desativar a si mesmo.');
  const existe = await prisma.usuario.findUnique({ where: { id } });
  if (!existe) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  const usuario = await prisma.usuario.update({ where: { id }, data: { ativo: false }, select: USUARIO_SELECT });
  await prisma.logAcao.create({
    data: { usuario_id: sessao.id, acao: 'usuario_desativado', detalhe: { usuario_alvo_id: id } },
  });
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

  // Sem orçamentos: limpa vínculos residuais (log de ações) e exclui.
  await prisma.$transaction([
    prisma.logAcao.deleteMany({ where: { usuario_id: id } }),
    prisma.usuario.delete({ where: { id } }),
  ]);
  // Auditoria: registrada pelo admin (ator), após excluir o alvo (e seus próprios logs).
  await prisma.logAcao.create({
    data: { usuario_id: sessao.id, acao: 'usuario_excluido', detalhe: { usuario_alvo_id: id, email: existe.email } },
  });
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
