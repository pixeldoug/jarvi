import { Request, Response } from 'express';
import {
  listTaskDescriptionVersions,
  restoreTaskDescriptionVersion,
} from '../services/taskDescriptionVersionService';

/** GET /api/tasks/:id/description-versions — what the description said before each AI change. */
export const getTaskDescriptionVersions = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }
  try {
    const versions = await listTaskDescriptionVersions(req.params.id, userId);
    if (!versions) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ versions });
  } catch (error) {
    console.error('Error listing task description versions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** POST /api/tasks/:id/description-versions/:versionId/restore — puts that version back. */
export const restoreTaskDescription = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }
  try {
    const restored = await restoreTaskDescriptionVersion(req.params.id, req.params.versionId, userId);
    if (!restored) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json(restored);
  } catch (error) {
    console.error('Error restoring a task description version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
