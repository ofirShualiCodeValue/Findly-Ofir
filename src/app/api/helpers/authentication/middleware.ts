import { Request, Response, NextFunction } from 'express';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { User, UserRole, UserStatus } from '../../../models/User';
import { verifyToken } from './jwt';

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
    const auth = req.headers.authorization;
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
      return next(new APIError(401, 'Missing or invalid Authorization header'));
    }

    const token = auth.slice('bearer '.length).trim();
    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      const e = err as Error;
      if (e.name === 'TokenExpiredError') {
        return next(new APIError(401, 'Token expired'));
      }
      return next(new APIError(401, 'Invalid token'));
    }

    const user = await User.findByPk(payload.sub);
    if (!user) {
      return next(new APIError(401, 'User not found'));
    }
    if (user.status !== UserStatus.ACTIVE) {
      return next(new APIError(403, `Account ${user.status}`));
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
