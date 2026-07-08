// apps/api/src/routes/auth.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, me, alterarSenha } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Proteção contra força bruta: no máx. 30 tentativas de login por IP a cada 15 min.
// Conta apenas tentativas que falham (skipSuccessfulRequests) — quem acerta a senha
// não é penalizado. Ao exceder, responde 429 sem revelar detalhes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'MUITAS_TENTATIVAS', message: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', me);
router.post('/alterar-senha', requireAuth, alterarSenha);

export default router;
