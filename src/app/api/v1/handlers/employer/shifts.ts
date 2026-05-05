import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import {
  Shift,
  ShiftStatus,
  ShiftCreateInput,
  ShiftUpdateInput,
  StaffingRequirementInput,
} from '../../../../models/Shift';
import { loadOwnedEvent } from '../../../helpers/events';
import { ShiftEntity } from '../../entities/employer/shifts/base';

const router = Router({ mergeParams: true });

// =====================================================================
// Input-validation helpers — pure shape/format checks. State-dependent
// rules (duration, FK existence) live on the Shift model.
// =====================================================================

function parseDateOr400(value: unknown, field: string): Date {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new APIError(400, `Invalid ${field}`);
  return d;
}

function parseShiftIdOr400(raw: string): number {
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) throw new APIError(400, 'Invalid shift id');
  return id;
}

/** Parse + de-duplicate the staffing requirements list. */
function parseStaffingRequirements(rawList: unknown): StaffingRequirementInput[] {
  if (rawList === undefined) return [];
  if (!Array.isArray(rawList)) {
    throw new APIError(400, 'staffing_requirements must be an array');
  }
  const out: StaffingRequirementInput[] = [];
  const seenIds = new Set<number>();
  for (const r of rawList) {
    if (!r || typeof r !== 'object') {
      throw new APIError(400, 'Each staffing_requirement must be an object');
    }
    const subId = (r as Record<string, unknown>).industry_subcategory_id;
    const count = (r as Record<string, unknown>).required_count;
    if (!Number.isInteger(subId) || (subId as number) < 1) {
      throw new APIError(400, 'industry_subcategory_id must be a positive integer');
    }
    if (count !== undefined && (!Number.isInteger(count) || (count as number) < 1)) {
      throw new APIError(400, 'required_count must be a positive integer');
    }
    if (seenIds.has(subId as number)) {
      throw new APIError(
        400,
        `Duplicate staffing requirement for industry_subcategory_id=${subId}. Use required_count to set quantity.`,
      );
    }
    seenIds.add(subId as number);
    out.push({
      industrySubCategoryId: subId as number,
      requiredCount: (count as number | undefined) ?? 1,
    });
  }
  return out;
}

function parseShiftStatusOr400(raw: unknown): ShiftStatus {
  if (!Object.values(ShiftStatus).includes(raw as ShiftStatus)) {
    throw new APIError(400, `status must be one of: ${Object.values(ShiftStatus).join(', ')}`);
  }
  return raw as ShiftStatus;
}

function parseCreateBody(body: Record<string, unknown>): ShiftCreateInput {
  const required = ['start_at', 'end_at'];
  const missing = required.filter((k) => !body[k]);
  if (missing.length) {
    throw new APIError(400, `Missing fields: ${missing.join(', ')}`);
  }
  return {
    startAt: parseDateOr400(body.start_at, 'start_at'),
    endAt: parseDateOr400(body.end_at, 'end_at'),
    contactPersonName: (body.contact_person_name as string | null | undefined) ?? null,
    contactPersonPhone: (body.contact_person_phone as string | null | undefined) ?? null,
    notes: (body.notes as string | null | undefined) ?? null,
    staffingRequirements: parseStaffingRequirements(body.staffing_requirements),
  };
}

function parseUpdateBody(body: Record<string, unknown>): ShiftUpdateInput {
  const updates: ShiftUpdateInput = {};
  if (body.start_at !== undefined) updates.startAt = parseDateOr400(body.start_at, 'start_at');
  if (body.end_at !== undefined) updates.endAt = parseDateOr400(body.end_at, 'end_at');
  if (body.contact_person_name !== undefined) {
    updates.contactPersonName = body.contact_person_name as string | null;
  }
  if (body.contact_person_phone !== undefined) {
    updates.contactPersonPhone = body.contact_person_phone as string | null;
  }
  if (body.notes !== undefined) updates.notes = body.notes as string | null;
  if (body.staffing_requirements !== undefined) {
    updates.staffingRequirements = parseStaffingRequirements(body.staffing_requirements);
  }
  // status is enum-validated but applied via direct update (not via
  // applyUpdates) since it's an admin-style override. Caller asks for the
  // status after parsing — we surface the value here for the route below.
  return updates;
}

async function loadShiftWithIncludes(shiftId: number, req: Request): Promise<Shift> {
  const fresh = await Shift.findByPk(shiftId, {
    include: ShiftEntity.includes(req),
  });
  if (!fresh) throw new APIError(404, 'Shift not found');
  return fresh;
}

async function assertOwnedShift(req: Request, shiftId: number): Promise<Shift> {
  const eventId = parseInt(req.params.eventId, 10);
  if (Number.isNaN(eventId)) throw new APIError(400, 'Invalid event id');
  await loadOwnedEvent(req, eventId);
  const shift = await Shift.findOne({ where: { id: shiftId, eventId } });
  if (!shift) throw new APIError(404, 'Shift not found');
  return shift;
}

// =====================================================================
// Routes — thin handlers: parse input → call model method → render.
// =====================================================================

/**
 * @openapi
 * /v1/employer/events/{eventId}/shifts:
 *   get:
 *     tags: [Employer Shifts]
 *     summary: List shifts of an event
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Array of shifts }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const shifts = await Shift.findAll({
      where: { eventId: event.id },
      include: ShiftEntity.includes(req),
      order: [['startAt', 'ASC']],
    });
    await renderSuccess(res, shifts, ShiftEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events/{eventId}/shifts:
 *   post:
 *     tags: [Employer Shifts]
 *     summary: Create a shift on an event
 *     description: |
 *       Shift duration must be 6–12 hours; outside that range the response is
 *       400 with code `SHIFT_DURATION_INVALID` and a `{min_hours, max_hours,
 *       actual_hours}` payload for the "Invalid Duration" popup.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [start_at, end_at]
 *             properties:
 *               start_at: { type: string, format: date-time }
 *               end_at: { type: string, format: date-time }
 *               contact_person_name: { type: string }
 *               contact_person_phone: { type: string }
 *               notes: { type: string }
 *               staffing_requirements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [industry_subcategory_id]
 *                   properties:
 *                     industry_subcategory_id: { type: integer }
 *                     required_count: { type: integer, minimum: 1, default: 1 }
 *     responses:
 *       201: { description: Shift created }
 *       400:
 *         description: Validation error (incl. SHIFT_DURATION_INVALID)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const input = parseCreateBody(req.body ?? {});
    const created = await Shift.createForEvent(event.id, input);

    res.status(201);
    const fresh = await loadShiftWithIncludes(created.id, req);
    await renderSuccess(res, fresh, ShiftEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events/{eventId}/shifts/{id}:
 *   patch:
 *     tags: [Employer Shifts]
 *     summary: Update shift fields
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseShiftIdOr400(req.params.id);
    const shift = await assertOwnedShift(req, id);
    const updates = parseUpdateBody(req.body ?? {});

    // Status is an admin-style override applied directly; everything else
    // routes through `applyUpdates` so the duration rule + staffing FKs
    // are enforced atomically.
    if (req.body?.status !== undefined) {
      const status = parseShiftStatusOr400(req.body.status);
      await shift.update({ status });
    }
    await shift.applyUpdates(updates);

    const fresh = await loadShiftWithIncludes(shift.id, req);
    await renderSuccess(res, fresh, ShiftEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events/{eventId}/shifts/{id}:
 *   delete:
 *     tags: [Employer Shifts]
 *     summary: Cancel a shift (soft — sets status=cancelled)
 *     security: [{ BearerAuth: [] }]
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseShiftIdOr400(req.params.id);
    const shift = await assertOwnedShift(req, id);
    await shift.cancel();

    const fresh = await loadShiftWithIncludes(shift.id, req);
    await renderSuccess(res, fresh, ShiftEntity);
  }),
);

export default router;
