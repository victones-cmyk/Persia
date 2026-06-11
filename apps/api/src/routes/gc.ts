// apps/api/src/routes/gc.ts
// Rotas de leitura do GestãoClick (autenticadas). Fase 4.

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { buscarClientes } from '../services/gc/clientes';

const router = Router();
router.use(requireAuth);

// GET /api/gc/clientes?q=termo — busca de clientes (frontend faz debounce 300ms).
router.get('/clientes', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '');
  const clientes = await buscarClientes(q);
  res.json({ clientes });
});

export default router;
