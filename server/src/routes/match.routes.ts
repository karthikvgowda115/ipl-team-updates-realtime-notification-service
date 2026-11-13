import { Router } from 'express';
import { getCurrent, start } from '../controllers/match.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/current', getCurrent);
router.post('/start', requireRole('admin'), start);

export default router;
