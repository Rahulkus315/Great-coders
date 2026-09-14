import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes';
import { store } from './server/store';
import { runMidnightSettlement, settleMorningCheckinsForDate } from './server/settlementEngine';
import { getISTNow, getISTDateString, TIMEZONE } from './server/timeUtils';

dotenv.config();

async function startServer() {
  await store.initialize();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('X-Frame-Options', 'DENY');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Parse JSON payloads
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Great Coders',
      currentIST: getISTNow().toISOString(),
      timezone: TIMEZONE,
    });
  });

  // API routes mounted FIRST
  app.use('/api', apiRouter);

  // Scheduled background check for 00:00 IST Midnight Settlement (Section 25)
  let lastSettledDate = '';
  let lastMorningMissedDate = '';
  setInterval(() => {
    try {
      const now = getISTNow();
      const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const [hour, minute] = timeFormatter.format(now).split(':').map(Number);
      const currentDate = getISTDateString(now);

      // Trigger at 00:00 or 00:01 IST if not yet settled for today
      if (hour === 0 && minute <= 5 && lastSettledDate !== currentDate) {
        console.log(`[Midnight Scheduler] Triggering automatic 00:00 IST settlement for ${currentDate}...`);
        lastSettledDate = currentDate;
        runMidnightSettlement(currentDate);
      }

      if (hour === 5 && minute <= 5 && lastMorningMissedDate !== currentDate) {
        console.log(`[Morning Check-in Scheduler] Closing wake-up window for ${currentDate} at 05:00 IST...`);
        lastMorningMissedDate = currentDate;
        void settleMorningCheckinsForDate(currentDate).catch((error) => {
          console.error('[Morning Check-in Scheduler] Settlement failed:', error);
        });
      }
    } catch (err) {
      console.error('[Midnight Scheduler] Error during background check:', err);
    }
  }, 60 * 1000);

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
