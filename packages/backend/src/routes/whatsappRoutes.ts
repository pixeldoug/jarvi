import { Router } from 'express';
import { receiveMessage } from '../controllers/whatsappWebhookController';

const router = Router();

router.post('/', receiveMessage);

export default router;
