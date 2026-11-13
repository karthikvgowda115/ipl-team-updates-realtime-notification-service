import { Router } from 'express';
import { login, me, register } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { loginLimiter } from '../middleware/loginLimiter';

const router = Router();

router.post('/register', register);
router.post('/login', loginLimiter, login); // 10 failed attempts / 15 min per IP + account → 429
router.get('/me', requireAuth, me);

export default router;
