// apps/api/src/middleware/auth.ts
// Verificação de sessão e perfil (SRD §7, §15).

import type { Request, Response, NextFunction } from 'express';

/** Exige sessão autenticada. Responde 401 caso contrário (frontend redireciona p/ /login). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.usuario) {
    res.status(401).json({ error: 'NAO_AUTENTICADO', message: 'Sessão inválida ou expirada.' });
    return;
  }
  next();
}

/** Exige perfil admin. Responde 403 para vendedor (SRD: /admin inacessível a vendedor). */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.usuario) {
    res.status(401).json({ error: 'NAO_AUTENTICADO', message: 'Sessão inválida ou expirada.' });
    return;
  }
  if (req.session.usuario.perfil !== 'admin') {
    res.status(403).json({ error: 'ACESSO_NEGADO', message: 'Acesso restrito ao administrador.' });
    return;
  }
  next();
}
