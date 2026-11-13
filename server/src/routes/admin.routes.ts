import { Router } from 'express';
import { getTeams, patchTeam } from '../controllers/team.controller';
import { requireAuth, requireRole } from '../middleware/auth';

/**
 * Admin API. Every route: valid JWT (401 otherwise) AND role "admin" (403 otherwise).
 * Team updates only write to MongoDB — the Change Stream turns them into notifications.
 */
const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/teams', getTeams);
router.patch('/teams/:id', patchTeam); // :id = team id or short code; several fields in one request

export default router;
