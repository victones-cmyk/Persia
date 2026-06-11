// apps/api/src/controllers/authController.ts
// Autenticação por sessão (express-session) + bcrypt (SRD §7, §15).

import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

/** Forma pública do usuário exposta ao frontend (sem senha_hash). */
function toSessionUser(u: {
  id: string;
  nome: string;
  email: string;
  perfil: 'vendedor' | 'admin';
  loja_id: string | null;
  gc_usuario_id: string | null;
  desconto_max_pct: { toString(): string };
}) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    loja_id: u.loja_id,
    gc_usuario_id: u.gc_usuario_id,
    desconto_max_pct: Number(u.desconto_max_pct),
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

  if (!usuario || !usuario.ativo || !senhaOk) {
    res.status(401).json({ error: 'CREDENCIAIS_INVALIDAS', message: 'E-mail ou senha incorretos' });
    return;
  }

  const sessionUser = toSessionUser(usuario);
  req.session.usuario = sessionUser;

  req.session.save((err) => {
    if (err) {
      console.error('[auth] falha ao salvar sessão:', err);
      res.status(500).json({ error: 'ERRO_INTERNO', message: 'Não foi possível iniciar a sessão.' });
      return;
    }
    res.json({ usuario: sessionUser });
  });
}

export function me(req: Request, res: Response): void {
  if (!req.session?.usuario) {
    res.status(401).json({ error: 'NAO_AUTENTICADO', message: 'Sessão inválida ou expirada.' });
    return;
  }
  res.json({ usuario: req.session.usuario });
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
