// apps/api/src/routes/auth.ts
import { Router } from 'express';
import { login, logout, me } from '../controllers/authController';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', me);

export default router;
