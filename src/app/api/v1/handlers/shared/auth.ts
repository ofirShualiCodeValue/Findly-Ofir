import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { SMSOTPCredentialSet } from '../../../../models/authentication/SMSOTPCredentialSet';
import '../../../../../config/auth/spec';
import { User, UserRole } from '../../../../models/User';
import {
  signToken,
  signRegistrationToken,
  verifyRegistrationToken,
} from '../../../helpers/authentication/jwt';
import config from '../../../../../../config';

const router = Router();

const OWNER_TYPE = 'User';

function normalizePhone(raw: string): string {
  return raw.trim();
}

function userToResponse(user: User) {
  return {
    id: user.id,
    full_name: user.fullName,
    phone: user.phone,
    email: user.email,
    role: user.role,
  };
}

/**
 * @openapi
 * /v1/shared/auth/sms/request:
 *   post:
 *     tags: [Authentication]
 *     summary: Send an SMS OTP to the phone (no user data required)
 *     description: |
 *       The endpoint never creates a User — it only ensures a credential
 *       row exists for this phone and ships the OTP. User creation is
 *       deferred until `POST /v1/shared/auth/register` after a successful
 *       OTP verify, so we never persist half-baked accounts.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: '+972501234567' }
 *     responses:
 *       200:
 *         description: OTP dispatched
 */
router.post(
  '/sms/request',
  asyncHandler(async (req: Request, res: Response) => {
    const phone = normalizePhone(String(req.body?.phone ?? ''));
    if (!phone) {
      throw new APIError(400, 'phone is required');
    }

    // messageOptions is required to prevent a destructure crash inside
    // core's SMSOTPCredentialSet.sendOtp.
    const sendOpts = { messageOptions: {} };

    const [creds] = await SMSOTPCredentialSet.signup(OWNER_TYPE, phone, sendOpts);

    // Fresh credentials are created with status='unassigned' (default).
    // login() rejects 'unassigned' as suspended; transition to 'pending'
    // so the next /sms/verify can promote it to 'active'. Existing
    // credentials (returning user) keep their current status.
    if (creds.status === 'unassigned') {
      await creds.update({ status: 'pending' });
    }
    await creds.sendConfirmationToken(sendOpts);

    // Dev convenience: surface the OTP in the response so the Flutter
    // client doesn't have to scrape the server log. NEVER in production.
    const devCode = config.get('env') === 'development' ? creds.generateOtp() : undefined;

    res.json({
      code: 200,
      message: 'ok',
      data: {
        ok: true,
        ...(devCode ? { dev_code: devCode } : {}),
      },
    });
  }),
);

/**
 * @openapi
 * /v1/shared/auth/sms/verify:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify SMS OTP
 *     description: |
 *       On success, returns either:
 *         - `{ token, user, is_new_user: false }` for an existing account
 *         - `{ registration_token, is_new_user: true }` if no user yet
 *           exists for the phone — the client uses the registration_token
 *           with `POST /v1/shared/auth/register` to finish signup.
 *     security: []
 */
router.post(
  '/sms/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const phone = normalizePhone(String(req.body?.phone ?? ''));
    const code = String(req.body?.code ?? '').trim();

    if (!phone || !code) {
      throw new APIError(400, 'phone and code are required');
    }

    try {
      await SMSOTPCredentialSet.login(OWNER_TYPE, phone, code);
    } catch (err) {
      const e = err as Error & { name?: string };
      if (e.name === 'AuthError' || e.message?.toLowerCase().includes('invalid')) {
        throw new APIError(401, 'Invalid or expired code');
      }
      throw err;
    }

    const user = await User.findByPhone(phone);
    if (user) {
      const token = signToken({ sub: user.id, role: user.role });
      res.json({
        code: 200,
        message: 'ok',
        data: {
          token,
          user: userToResponse(user),
          is_new_user: false,
        },
      });
      return;
    }

    // OTP verified, but no user exists for this phone yet. Hand the
    // client a short-lived registration token so the next step can
    // finish signup.
    const registrationToken = signRegistrationToken(phone);
    res.json({
      code: 200,
      message: 'ok',
      data: {
        is_new_user: true,
        registration_token: registrationToken,
      },
    });
  }),
);

/**
 * @openapi
 * /v1/shared/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Complete signup after OTP verification
 *     description: |
 *       Requires the `registration_token` from `/sms/verify` as the
 *       Bearer credential. Creates the User and the role-specific
 *       profile, binds the existing credential to the new user, and
 *       returns a full session JWT.
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, role]
 *             properties:
 *               full_name: { type: string }
 *               role: { type: string, enum: [employer, employee] }
 *     responses:
 *       200:
 *         description: Returns full JWT + user
 */
router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    // Extract + verify the registration token directly here (we cannot
    // reuse the regular `authenticate` middleware because it requires a
    // standard JWT with `sub`).
    const auth = req.headers.authorization;
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
      throw new APIError(401, 'Missing or invalid Authorization header');
    }
    const token = auth.slice('bearer '.length).trim();
    let payload;
    try {
      payload = verifyRegistrationToken(token);
    } catch {
      throw new APIError(401, 'Invalid or expired registration token');
    }

    const fullName = String(req.body?.full_name ?? '').trim();
    const role = req.body?.role as UserRole | undefined;

    if (!fullName) {
      throw new APIError(400, 'full_name is required');
    }
    if (!role || !Object.values(UserRole).includes(role)) {
      throw new APIError(400, 'role must be employer or employee');
    }

    const user = await User.completeSignup({
      phone: payload.phone,
      fullName,
      role,
    });

    // Bind the (already OTP-verified) credential to the freshly-created
    // user so future /sms/verify rounds can identify them by ownerId.
    const creds = await SMSOTPCredentialSet.findOne({
      where: { ownerType: OWNER_TYPE, sid: payload.phone },
    });
    if (creds) {
      await creds.update({ ownerId: user.id });
    }

    const sessionToken = signToken({ sub: user.id, role: user.role });
    res.json({
      code: 200,
      message: 'ok',
      data: {
        token: sessionToken,
        user: userToResponse(user),
        is_new_user: false,
      },
    });
  }),
);

/**
 * @openapi
 * /v1/shared/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Client-side logout (JWT is stateless — clients should drop the token)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Acknowledged
 */
router.post(
  '/logout',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ code: 200, message: 'ok', data: { ok: true } });
  }),
);

// dev-only: do not expose in production
if (config.get('env') === 'development') {
  router.get(
    '/dev/last-otp',
    asyncHandler(async (req: Request, res: Response) => {
      const phone = String(req.query.phone ?? '').trim();
      if (!phone) throw new APIError(400, 'phone query param required');
      // The credential is stored under the SDK's normalized form
      // (e.g. '+972 50 000 0050' via libphonenumber's formatInternational).
      // The raw input '+972500000050' won't match — go through formatSid so
      // the lookup matches whatever /sms/request persisted.
      const formattedSid = SMSOTPCredentialSet.formatSid(phone, 'IL');
      const creds = await SMSOTPCredentialSet.findOne({
        where: { ownerType: OWNER_TYPE, sid: formattedSid },
      });
      if (!creds) {
        throw new APIError(404, 'No active OTP found — call /sms/request first');
      }
      const code = creds.generateOtp();
      res.json({ code: 200, message: 'ok', data: { phone, code } });
    }),
  );
}

export default router;
