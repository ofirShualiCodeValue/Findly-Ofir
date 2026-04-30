import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import config from '../../../../../config';

export interface JWTPayload {
  sub: number;
  role: string;
}

const secret: Secret = config.jwt.secret;

export function signToken(payload: JWTPayload): string {
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  const options: SignOptions = {
    expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'],
    issuer: 'findly-server',
  };
  return jwt.sign(payload, secret, options);
}

export function verifyToken(token: string): JWTPayload {
  const decoded = jwt.verify(token, secret, { issuer: 'findly-server' });
  if (typeof decoded === 'string') {
    throw new Error('Unexpected token format');
  }
  return decoded as unknown as JWTPayload;
}
