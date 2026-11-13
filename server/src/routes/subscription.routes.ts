import { Router } from 'express';
import { follow, getMySubscriptions, unfollow, updateFields } from '../controllers/subscription.controller';
import { requireAuth } from '../middleware/auth';

// Resource-style subscription API (same handlers as /api/teams/:short/follow).
// `:teamId` accepts the team's id or its short code ("RCB").
const router = Router();

router.use(requireAuth);

router.get('/', getMySubscriptions);
router.post('/', follow); // { teamId, fields? }
router.patch('/:teamId', updateFields); // { fields }
router.delete('/:teamId', unfollow);

export default router;
