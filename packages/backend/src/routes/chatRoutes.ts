import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import { deleteChat, getChat, getChats } from '../controllers/chatController';

const router = Router();

// Same access as notes: authenticated, with an active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

router.get('/', getChats);
router.get('/:id', getChat);
router.delete('/:id', deleteChat);

export default router;
