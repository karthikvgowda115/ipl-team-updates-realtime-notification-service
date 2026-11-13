import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import teamRoutes from './routes/team.routes';
import subscriptionRoutes from './routes/subscription.routes';
import notificationRoutes from './routes/notification.routes';
import matchRoutes from './routes/match.routes';
import adminRoutes from './routes/admin.routes';
import { errorHandler, notFound } from './middleware/errorHandler';

const app = express();

// Behind nginx (Docker) the client IP comes from X-Forwarded-For; trust it only from
// private-network proxies, so the login limiter sees real client IPs.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(express.json({ limit: '10kb' }));

// /health for direct checks (Docker healthcheck, curl);
// /api/health for the frontend, which talks to the API under /api.
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
