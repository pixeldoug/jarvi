import { Router } from 'express';
import { joinEarlyAccess } from '../controllers/earlyAccessController';

const router = Router();

router.post('/', joinEarlyAccess);

export default router;
