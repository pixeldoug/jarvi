import { Request, Response } from 'express';
import {
  createRemindersForTask,
  deleteReminder,
  listRemindersForTask,
  parseReminderInput,
  replaceRemindersForTask,
} from '../services/reminderService';

export const getReminders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const reminders = await listRemindersForTask(taskId, userId);
    res.json(reminders);
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createReminder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const input = parseReminderInput(req.body);
    if (!input) {
      res.status(400).json({ error: 'Invalid reminder payload' });
      return;
    }

    const [created] = await createRemindersForTask(taskId, userId, [input]);
    if (!created) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error && error.message === 'Task not found') {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    console.error('Error creating reminder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const replaceReminders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;
    const { reminders } = req.body as { reminders?: unknown };

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!Array.isArray(reminders)) {
      res.status(400).json({ error: 'reminders must be an array' });
      return;
    }

    const inputs = reminders
      .map((item) => parseReminderInput(item))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (inputs.length !== reminders.length) {
      res.status(400).json({ error: 'One or more reminders are invalid' });
      return;
    }

    const updated = await replaceRemindersForTask(taskId, userId, inputs);
    res.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Task not found') {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    console.error('Error replacing reminders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteReminderHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const deleted = await deleteReminder(taskId, id, userId);
    if (!deleted) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json({ message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
