import { Router } from 'express';
import { getNotifications, getUnreadCount, readAll, readOne } from '../controllers/notification.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', readAll); // before /:id so "read-all" isn't taken as an id
router.patch('/:id/read', readOne);

export default router;
