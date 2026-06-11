// apps/api/src/types/session.d.ts
// Augmentação da sessão do express-session com os dados do usuário autenticado.

import 'express-session';
import type { Perfil } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    usuario?: {
      id: string;
      nome: string;
      email: string;
      perfil: Perfil;
      loja_id: string | null;
      gc_usuario_id: string | null;
      desconto_max_pct: number;
    };
  }
}
