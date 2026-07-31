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
      senha_provisoria: boolean;
      // Só relevantes para perfil revenda (ver Perfil.revenda).
      gc_cliente_vinculado_id: string | null;
      gc_cliente_vinculado_nome: string | null;
      desconto_percentual: number | null;
      calculadoras_permitidas: string[];
    };
  }
}
