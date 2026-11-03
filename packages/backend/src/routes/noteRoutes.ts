import { Router, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import {
  createNote,
  createNoteSummary,
  createNoteTasks,
  createNoteTranscription,
  deleteNote,
  getNote,
  getNotes,
  patchNote,
  pinNote,
  reviewNoteStep,
} from '../controllers/noteController';

const router = Router();

// Todas as rotas de notas requerem autenticação e assinatura ativa
router.use(authenticateToken);
router.use(requireActiveSubscription);

// Per-user limits for the OpenAI-backed routes. They run after
// authenticateToken, so `req.user` is set (unlike the IP-keyed aiLimiter).
const userKey = (req: Request): string =>
  req.user?.id || (req.ip ? ipKeyGenerator(req.ip) : 'unknown');

// ~30 s segments → 2/min while recording; headroom for retries.
const transcriptionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: userKey,
  message: { error: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
});

const summaryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: userKey,
  message: { error: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
});

// No OpenAI call, but each request writes up to 30 tasks.
const tasksLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: userKey,
  message: { error: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rotas CRUD para notas
router.post('/', createNote);
router.get('/', getNotes);
// `GET /api/notes/shared` belongs to noteShareRoutes (mounted later on /api).
router.get(
  '/:id',
  (req, _res, next) => (req.params.id === 'shared' ? next('router') : next()),
  getNote,
);
router.patch('/:id', patchNote);
router.delete('/:id', deleteNote);
// Pinned to the top of the caller's list (per user)
router.put('/:id/pin', pinNote);

// Notas: live transcript segments and the AI summary
router.post('/:id/transcriptions', transcriptionLimiter, createNoteTranscription);
router.post('/:id/summary', summaryLimiter, createNoteSummary);
// Notas: the summary's next steps → tasks
router.post('/:id/tasks', tasksLimiter, createNoteTasks);
// …and the user's answer when a regenerated step may repeat one with a task
router.post('/:id/steps/:stepId/review', tasksLimiter, reviewNoteStep);

export default router;
