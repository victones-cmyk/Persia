// apps/api/src/routes/agenda.ts
// Consulta ao app Agenda SEM um orçamento no meio. As rotas de agenda que já
// existiam vivem sob /orcamentos/:id/agenda porque pressupõem um orçamento
// salvo; estas atendem o caminho inverso — o vendedor parte da medição, e nesse
// momento o orçamento ainda não existe.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { buscarEventosAgendaAvulso, listarAmbientesDeEvento } from '../controllers/agendaController';

const router = Router();
router.use(requireAuth);

router.get('/eventos/buscar', buscarEventosAgendaAvulso);
router.get('/eventos/:id/ambientes', listarAmbientesDeEvento);

export default router;
