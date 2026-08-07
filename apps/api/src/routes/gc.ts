// apps/api/src/routes/gc.ts
// Rotas de leitura do GestãoClick (autenticadas). Fase 4.

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { buscarClientes, criarClienteRapido } from '../services/gc/clientes';
import { buscarRevendaPorClienteGc } from '../lib/permissaoRevenda';
import { env } from '../config/env';

const router = Router();
router.use(requireAuth);

router.get('/clientes/:id/editar', (req: Request, res: Response) => {
  const id = String(req.params.id ?? '').trim();
  if (!/^[\w.-]+$/.test(id)) {
    throw new AppError(400, 'CLIENTE_INVALIDO', 'Cliente inválido.');
  }
  const url = env.GC_CLIENTE_URL_TEMPLATE.replace('{id}', encodeURIComponent(id));
  res.redirect(url);
});

// GET /api/gc/clientes/:id/revenda — cliente do GC está vinculado a uma revenda?
// Usado pelo vendedor/admin pra detectar automaticamente o desconto ao escolher o
// cliente no orçamento. Restrito a admin/vendedor: uma revenda logada não precisa
// (o desconto dela já vem da própria sessão) e não deve ver o % de outra revenda.
router.get('/clientes/:id/revenda', async (req: Request, res: Response) => {
  const sessao = req.session.usuario!;
  if (sessao.perfil === 'revenda') {
    throw new AppError(403, 'ACESSO_NEGADO', 'Não disponível para o perfil revenda.');
  }
  const id = String(req.params.id ?? '').trim();
  if (!id) throw new AppError(400, 'CLIENTE_INVALIDO', 'Cliente inválido.');
  const revenda = await buscarRevendaPorClienteGc(id);
  res.json({ revenda });
});

// GET /api/gc/clientes?q=termo — busca de clientes (frontend faz debounce 300ms).
router.get('/clientes', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '');
  const clientes = await buscarClientes(q);
  res.json({ clientes });
});

router.post('/clientes', async (req: Request, res: Response) => {
  const body = req.body as { nome?: unknown; telefone?: unknown } | null;
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
  const telefone = typeof body?.telefone === 'string' ? body.telefone.trim() : '';

  if (nome.length < 2) {
    throw new AppError(400, 'NOME_CLIENTE_OBRIGATORIO', 'Informe o nome do cliente.');
  }
  if (nome.length > 150) {
    throw new AppError(400, 'NOME_CLIENTE_INVALIDO', 'O nome do cliente deve ter no máximo 150 caracteres.');
  }
  if (telefone.length > 30) {
    throw new AppError(400, 'TELEFONE_CLIENTE_INVALIDO', 'O telefone deve ter no máximo 30 caracteres.');
  }

  const cliente = await criarClienteRapido({ nome, telefone });
  res.status(201).json({ cliente });
});

export default router;
