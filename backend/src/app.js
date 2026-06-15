import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import providersRoutes from './routes/providers.js';
import pagesRoutes from './routes/pages.js';
import skillsRoutes from './routes/skills.js';
import postsRoutes from './routes/posts.js';
import jobsRoutes from './routes/jobs.js';
import notificationsRoutes from './routes/notifications.js';
import activityRoutes from './routes/activity.js';
import uploadRoutes from './routes/upload.js';
import settingsRoutes from './routes/settings.js';
import { activityLogger } from './middleware/activityLog.js';
import { startScheduler } from './services/scheduler.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, '../../public');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(activityLogger);
app.use('/images', express.static(path.join(publicPath, 'images')));
app.use('/videos', express.static(path.join(publicPath, 'videos')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'autopost-backend', scheduler: process.env.DISABLE_SCHEDULER !== 'true' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(port, () => {
  console.log(`AutoPost backend listening on http://localhost:${port}`);
  startScheduler();
});
