import { Request, Response, NextFunction } from 'express';
import { appDb } from '../db';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const { data, error } = await appDb.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    res.locals.user = data.user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
