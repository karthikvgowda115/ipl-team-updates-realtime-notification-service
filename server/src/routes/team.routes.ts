import { Router } from 'express';
import { getTeam, getTeams, patchTeam } from '../controllers/team.controller';
import { follow, unfollow, updateFields } from '../controllers/subscription.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', getTeams);
router.get('/:id', getTeam); // id or short code
// Admin update, kept for existing clients/scripts; the admin API is /api/admin/teams/:id.
router.patch('/:short', requireRole('admin'), patchTeam);
router.post('/:short/follow', follow);
router.patch('/:short/follow', updateFields);
router.delete('/:short/follow', unfollow);

export default router;
