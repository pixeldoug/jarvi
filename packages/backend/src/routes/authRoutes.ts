import { Router } from 'express';
import { 
  googleAuth, 
  register, 
  login, 
  getProfile,
  verifyEmail,
  verifyEmailOtp,
  resendVerification,
  forgotPassword,
  resetPassword,
  disconnectGoogle,
  addPasswordToGoogleAccount
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/google', googleAuth);
router.post('/register', register);
router.post('/login', login);

// Email verification routes (public)
router.post('/verify-email', verifyEmail);
router.post('/verify-email-otp', verifyEmailOtp);
router.post('/resend-verification', resendVerification);

// Password reset routes (public)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.post('/google/add-password', authenticateToken, addPasswordToGoogleAccount);
router.delete('/google/disconnect', authenticateToken, disconnectGoogle);

export default router;
