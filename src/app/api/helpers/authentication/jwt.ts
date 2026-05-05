import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import config from '../../../../../config';

export interface JWTPayload {
  sub: number;
  role: string;
}

const secret: Secret = config.get('jwt.secret');

export function signToken(payload: JWTPayload): string {
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  const options: SignOptions = {
    expiresIn: config.get('jwt.expiresIn') as SignOptions['expiresIn'],
    issuer: 'findly-server',
  };
  return jwt.sign(payload, secret, options);
}

export function verifyToken(token: string): JWTPayload {
  const decoded = jwt.verify(token, secret, { issuer: 'findly-server' });
  if (typeof decoded === 'string') {
    throw new Error('Unexpected token format');
  }
  // Reject registration tokens — they're not valid auth credentials.
  if ((decoded as { purpose?: string }).purpose === 'registration') {
    throw new Error('Registration tokens cannot be used to authenticate');
  }
  return decoded as unknown as JWTPayload;
}

/**
 * Short-lived (10 min) token issued after a successful OTP verification
 * for a phone that doesn't yet have a User. Carries no user id — only
 * the verified phone and a `purpose` claim — so it cannot be used as a
 * regular auth Bearer token. Consumed by `POST /v1/shared/auth/register`
 * to finish creating the account.
 */
export interface RegistrationTokenPayload {
  phone: string;
  purpose: 'registration';
}

export function signRegistrationToken(phone: string): string {
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const payload: RegistrationTokenPayload = { phone, purpose: 'registration' };
  return jwt.sign(payload, secret, {
    expiresIn: '10m',
    issuer: 'findly-server',
  });
}

export function verifyRegistrationToken(token: string): RegistrationTokenPayload {
  const decoded = jwt.verify(token, secret, { issuer: 'findly-server' });
  if (typeof decoded === 'string' || (decoded as { purpose?: string }).purpose !== 'registration') {
    throw new Error('Not a registration token');
  }
  return decoded as unknown as RegistrationTokenPayload;
}
