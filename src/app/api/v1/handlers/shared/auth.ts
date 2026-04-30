import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { SMSOTPCredentialSet } from '../../../../models/authentication/SMSOTPCredentialSet';
import '../../../../../config/auth/spec';
import { User, UserRole, UserStatus } from '../../../../models/User';
import { EmployerProfile } from '../../../../models/EmployerProfile';
import { EmployeeProfile } from '../../../../models/EmployeeProfile';
import { signToken } from '../../../helpers/authentication/jwt';
import config from '../../../../../../config';

const router = Router();

const OWNER_TYPE = 'User';

function normalizePhone(raw: string): string {
  return raw.trim();
}

/**
 * @openapi
 * /v1/shared/auth/sms/request:
 *   post:
 *     tags: [Authentication]
 *     summary: Request an SMS OTP code (signup or login)
 *     description: |
 *       If the phone number is unknown, a new User is created with the provided role.
 *       If known, the existing user's role is used and `role` in the request body is ignored.
 *       The OTP is sent via the configured SMS gateway. In development the OTP is printed
 *       to the server console.
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
 *               role:
 *                 type: string
 *                 enum: [employer, employee]
 *                 description: Required when creating a new user
 *               full_name: { type: string, description: Required when creating a new user }
 *     responses:
 *       200:
 *         description: OTP dispatched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 is_new_user: { type: boolean }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.post(
  '/sms/request',
  asyncHandler(async (req: Request, res: Response) => {
    const phone = normalizePhone(String(req.body?.phone ?? ''));
    const role = req.body?.role as UserRole | undefined;
    const fullName = (req.body?.full_name as string | undefined)?.trim();

    if (!phone) {
      throw new APIError(400, 'phone is required');
    }

    let user = await User.findOne({ where: { phone } });
    let isNewUser = false;

    if (!user) {
      if (!role || !Object.values(UserRole).includes(role)) {
        throw new APIError(400, 'role is required for new users (employer or employee)');
      }
      user = await User.create({
        phone,
        fullName: fullName || phone,
        role,
        status: UserStatus.ACTIVE,
      } as Partial<User>);
      // Create the matching role-specific profile so PATCH /profile has a row to update
      if (role === UserRole.EMPLOYER) {
        await EmployerProfile.create({
          userId: user.id,
          businessName: fullName || phone,
        } as Partial<EmployerProfile>);
      } else {
        await EmployeeProfile.create({
          userId: user.id,
        } as Partial<EmployeeProfile>);
      }
      isNewUser = true;
    }

    // messageOptions is required to prevent a destructure crash inside core's
    // SMSOTPCredentialSet.sendOtp (it does `{ messageOptions: { locale = ... } }`
    // and crashes when messageOptions is undefined).
    const sendOpts = { messageOptions: {} };

    const [creds] = await SMSOTPCredentialSet.signup(OWNER_TYPE, phone, sendOpts);
    if (!creds.ownerId) {
      // First-time attach: this also triggers initial OTP send via core
      await creds.attachTo(user.id, OWNER_TYPE, sendOpts);
    } else {
      // Existing credential: rotate authenticator secret + send fresh OTP
      await creds.sendConfirmationToken(sendOpts);
    }

    // Dev convenience: surface the OTP in the response so the Flutter client
    // doesn't have to scrape the server log. NEVER enable this in production.
    const devCode = config.env === 'development' ? creds.generateOtp() : undefined;

    res.json({
      code: 200,
      message: 'ok',
      data: {
        ok: true,
        is_new_user: isNewUser,
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
 *     summary: Verify SMS OTP and receive a JWT
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, code]
 *             properties:
 *               phone: { type: string }
 *               code: { type: string, example: '123456' }
 *     responses:
 *       200:
 *         description: Returns JWT token + user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     full_name: { type: string }
 *                     phone: { type: string }
 *                     role: { type: string, enum: [employer, employee] }
 *       401: { $ref: '#/components/responses/Unauthorized' }
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

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      throw new APIError(401, 'User not found');
    }

    const token = signToken({ sub: user.id, role: user.role });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        token,
        user: {
          id: user.id,
          full_name: user.fullName,
          phone: user.phone,
          email: user.email,
          role: user.role,
        },
      },
    });
  }),
);

/**
 * @openapi
 * /v1/shared/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Client-side logout (JWT is stateless ג€” clients should drop the token)
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
if (config.env === 'development') {
  router.get(
    '/dev/last-otp',
    asyncHandler(async (req: Request, res: Response) => {
      const phone = String(req.query.phone ?? '').trim();
      if (!phone) throw new APIError(400, 'phone query param required');
      const creds = await SMSOTPCredentialSet.findOne({
        where: { ownerType: OWNER_TYPE, sid: phone },
      });
      if (!creds || !creds.token) {
        throw new APIError(404, 'No active OTP found ג€” call /sms/request first');
      }
      const code = creds.generateOtp();
      res.json({ code: 200, message: 'ok', data: { phone, code } });
    }),
  );
}

export default router;
