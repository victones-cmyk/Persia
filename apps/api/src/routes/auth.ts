// apps/api/src/routes/auth.ts
import { Router } from 'express';
import { login, logout, me, alterarSenha } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', me);
router.post('/alterar-senha', requireAuth, alterarSenha);

export default router;
