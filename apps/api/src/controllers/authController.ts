// apps/api/src/controllers/authController.ts
// Autenticação por sessão (express-session) + bcrypt (SRD §7, §15).

import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { validarSenha } from '../lib/senha';

/** Forma pública do usuário exposta ao frontend (sem senha_hash). */
function toSessionUser(u: {
  id: string;
  nome: string;
  email: string;
  perfil: 'vendedor' | 'admin' | 'revenda';
  loja_id: string | null;
  gc_usuario_id: string | null;
  senha_provisoria: boolean;
  gc_cliente_vinculado_id: string | null;
  gc_cliente_vinculado_nome: string | null;
  desconto_percentual: Prisma.Decimal | null;
  calculadoras_permitidas: string[];
  markup_percentual: Prisma.Decimal | null;
}) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    loja_id: u.loja_id,
    gc_usuario_id: u.gc_usuario_id,
    senha_provisoria: u.senha_provisoria,
    gc_cliente_vinculado_id: u.gc_cliente_vinculado_id,
    gc_cliente_vinculado_nome: u.gc_cliente_vinculado_nome,
    desconto_percentual: u.desconto_percentual != null ? Number(u.desconto_percentual) : null,
    calculadoras_permitidas: u.calculadoras_permitidas,
    markup_percentual: u.markup_percentual != null ? Number(u.markup_percentual) : null,
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, senha } = req.body ?? {};

  if (typeof email !== 'string' || typeof senha !== 'string' || !email || !senha) {
    // Mensagem genérica — não revela qual campo está errado (SRD §15).
    res.status(401).json({ error: 'CREDENCIAIS_INVALIDAS', message: 'E-mail ou senha incorretos' });
    return;
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });

  // Comparação sempre executada mesmo sem usuário, para mitigar enumeração por timing.
  const hash = usuario?.senha_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const senhaOk = bcrypt.compareSync(senha, hash);

  if (!usuario || !senhaOk) {
    res.status(401).json({ error: 'CREDENCIAIS_INVALIDAS', message: 'Usuário ou senha incorretos' });
    return;
  }
  // Credenciais corretas, mas o usuário foi desativado: mensagem específica.
  if (!usuario.ativo) {
    res.status(401).json({ error: 'USUARIO_INATIVO', message: 'Usuário inativo. Procure o administrador.' });
    return;
  }

  const sessionUser = toSessionUser(usuario);

  // Regenera o id de sessão na autenticação (previne session fixation: um id
  // de sessão "plantado" antes do login deixa de valer após autenticar).
  req.session.regenerate((errRegen) => {
    if (errRegen) {
      console.error('[auth] falha ao regenerar sessão:', errRegen);
      res.status(500).json({ error: 'ERRO_INTERNO', message: 'Não foi possível iniciar a sessão.' });
      return;
    }
    req.session.usuario = sessionUser;
    req.session.save((err) => {
      if (err) {
        console.error('[auth] falha ao salvar sessão:', err);
        res.status(500).json({ error: 'ERRO_INTERNO', message: 'Não foi possível iniciar a sessão.' });
        return;
      }
      res.json({ usuario: sessionUser });
    });
  });
}

export function me(req: Request, res: Response): void {
  if (!req.session?.usuario) {
    res.status(401).json({ error: 'NAO_AUTENTICADO', message: 'Sessão inválida ou expirada.' });
    return;
  }
  res.json({ usuario: req.session.usuario });
}

/**
 * Troca a senha do próprio usuário logado (autoatendimento + troca obrigatória
 * no primeiro acesso). Exige a senha atual. Limpa a flag senha_provisoria.
 */
export async function alterarSenha(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario;
  if (!sessao) {
    res.status(401).json({ error: 'NAO_AUTENTICADO', message: 'Sessão inválida ou expirada.' });
    return;
  }

  const { senha_atual, senha_nova } = req.body ?? {};
  if (typeof senha_atual !== 'string' || typeof senha_nova !== 'string' || !senha_atual || !senha_nova) {
    res.status(400).json({ error: 'CAMPOS_OBRIGATORIOS', message: 'Informe a senha atual e a nova senha.' });
    return;
  }
  const erroSenha = validarSenha(senha_nova);
  if (erroSenha) {
    res.status(400).json({ error: 'SENHA_FRACA', message: erroSenha });
    return;
  }
  if (senha_nova === senha_atual) {
    res.status(400).json({ error: 'SENHA_IGUAL', message: 'A nova senha deve ser diferente da atual.' });
    return;
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sessao.id } });
  if (!usuario || !usuario.ativo) {
    res.status(401).json({ error: 'NAO_AUTENTICADO', message: 'Sessão inválida ou expirada.' });
    return;
  }
  if (!bcrypt.compareSync(senha_atual, usuario.senha_hash)) {
    res.status(400).json({ error: 'SENHA_ATUAL_INVALIDA', message: 'Senha atual incorreta.' });
    return;
  }

  const atualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senha_hash: bcrypt.hashSync(senha_nova, 10), senha_provisoria: false },
  });

  const sessionUser = toSessionUser(atualizado);
  // Regenera o id de sessão após a troca de senha (mesma proteção do login).
  req.session.regenerate((errRegen) => {
    if (errRegen) {
      console.error('[auth] falha ao regenerar sessão após troca de senha:', errRegen);
      res.status(500).json({ error: 'ERRO_INTERNO', message: 'Não foi possível concluir a troca.' });
      return;
    }
    req.session.usuario = sessionUser;
    req.session.save((err) => {
      if (err) {
        console.error('[auth] falha ao salvar sessão após troca de senha:', err);
        res.status(500).json({ error: 'ERRO_INTERNO', message: 'Não foi possível concluir a troca.' });
        return;
      }
      res.json({ usuario: sessionUser });
    });
  });
}

/**
 * Markup próprio da revenda (autoatendimento — diferente do desconto, que é
 * definido pelo admin). Só o perfil revenda pode usar; atualiza só o próprio usuário.
 */
export async function atualizarMarkup(req: Request, res: Response): Promise<void> {
  const sessao = req.session.usuario;
  if (!sessao) {
    res.status(401).json({ error: 'NAO_AUTENTICADO', message: 'Sessão inválida ou expirada.' });
    return;
  }
  if (sessao.perfil !== 'revenda') {
    res.status(403).json({ error: 'ACESSO_NEGADO', message: 'Markup é exclusivo do perfil revenda.' });
    return;
  }

  const { markup_percentual } = req.body ?? {};
  const valor = markup_percentual === null || markup_percentual === '' ? null : Number(markup_percentual);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 999.99)) {
    res.status(400).json({ error: 'MARKUP_INVALIDO', message: 'O markup deve estar entre 0 e 999,99%.' });
    return;
  }

  const atualizado = await prisma.usuario.update({
    where: { id: sessao.id },
    data: { markup_percentual: valor },
  });

  const sessionUser = toSessionUser(atualizado);
  req.session.usuario = sessionUser;
  req.session.save((err) => {
    if (err) {
      console.error('[auth] falha ao salvar sessão após atualizar markup:', err);
      res.status(500).json({ error: 'ERRO_INTERNO', message: 'Não foi possível salvar o markup.' });
      return;
    }
    res.json({ usuario: sessionUser });
  });
}

export function logout(req: Request, res: Response): void {
  req.session.destroy((err) => {
    if (err) {
      console.error('[auth] falha ao destruir sessão:', err);
    }
    res.clearCookie('persia.sid');
    res.json({ ok: true });
  });
}
