import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  completeOnboarding,
  requestOnboardingWhatsapp,
  trackOnboardingStep,
  verifyOnboardingWhatsapp,
} from '../controllers/onboardingController';

const router = Router();

router.post('/whatsapp/request', requestOnboardingWhatsapp);
router.post('/whatsapp/verify', verifyOnboardingWhatsapp);
router.post('/step', authenticateToken, trackOnboardingStep);
router.post('/complete', authenticateToken, completeOnboarding);

export default router;
