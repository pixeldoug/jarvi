import { Router } from 'express';
import { handleCallStatus, handleReminderTwiml } from '../controllers/voiceWebhookController';

const router = Router();

router.post('/reminder-twiml', handleReminderTwiml);
router.post('/status', handleCallStatus);

export default router;
