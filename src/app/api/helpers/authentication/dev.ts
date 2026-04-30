import { Request, Response, NextFunction } from 'express';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { User, UserRole } from '../../../models/User';

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userIdHeader = req.header('X-User-Id');
    if (!userIdHeader) {
      return next(new APIError(401, 'Missing X-User-Id header'));
    }

    const userId = parseInt(userIdHeader, 10);
    if (Number.isNaN(userId)) {
      return next(new APIError(401, 'Invalid X-User-Id header'));
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return next(new APIError(401, 'User not found'));
    }

    req.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.currentUser) {
      return next(new APIError(401, 'Not authenticated'));
    }
    if (req.currentUser.role !== role) {
      return next(new APIError(403, `Requires ${role} role`));
    }
    next();
  };
}
