import { Router, Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { sequelize } from '../../../../../db/connection';
import { Shift, ShiftStatus } from '../../../../models/Shift';
import { ShiftStaffingRequirement } from '../../../../models/ShiftStaffingRequirement';
import { IndustrySubCategory } from '../../../../models/IndustrySubCategory';
import { loadOwnedEvent } from '../../../helpers/events';
import { ShiftEntity } from '../../entities/employer/shifts/base';

// Israeli labor convention used by the Findly product spec.
const MIN_SHIFT_HOURS = 6;
const MAX_SHIFT_HOURS = 12;

const router = Router({ mergeParams: true });

interface StaffingRequirementInput {
  industry_subcategory_id: number;
  required_count?: number;
}

function parseDateOr400(value: unknown, field: string): Date {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new APIError(400, `Invalid ${field}`);
  return d;
}

function assertShiftDuration(startAt: Date, endAt: Date): void {
  if (endAt <= startAt) {
    throw new APIError(400, 'end_at must be after start_at');
  }
  const hours = (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60);
  if (hours < MIN_SHIFT_HOURS || hours > MAX_SHIFT_HOURS) {
    throw new APIError(400, 'Shift duration must be between 6 and 12 hours', {
      code: 'SHIFT_DURATION_INVALID',
      min_hours: MIN_SHIFT_HOURS,
      max_hours: MAX_SHIFT_HOURS,
      actual_hours: Math.round(hours * 100) / 100,
    });
  }
}

async function validateStaffingRequirements(
  rawList: unknown,
): Promise<StaffingRequirementInput[]> {
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
      industry_subcategory_id: subId as number,
      required_count: (count as number | undefined) ?? 1,
    });
  }
  if (out.length) {
    const found = await IndustrySubCategory.count({
      where: { id: out.map((r) => r.industry_subcategory_id) },
    });
    if (found !== out.length) {
      throw new APIError(400, 'One or more industry_subcategory_id values are invalid');
    }
  }
  return out;
}

async function loadShiftWithIncludes(shiftId: number): Promise<Shift> {
  const fresh = await Shift.findByPk(shiftId, {
    include: ShiftEntity.includes({} as Request),
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
    const body = req.body ?? {};

    const required = ['start_at', 'end_at'];
    const missing = required.filter((k) => !body[k]);
    if (missing.length) {
      throw new APIError(400, `Missing fields: ${missing.join(', ')}`);
    }

    const startAt = parseDateOr400(body.start_at, 'start_at');
    const endAt = parseDateOr400(body.end_at, 'end_at');
    assertShiftDuration(startAt, endAt);
    const reqs = await validateStaffingRequirements(body.staffing_requirements);

    const created = await sequelize.transaction(async (transaction: Transaction) => {
      const shift = await Shift.create(
        {
          eventId: event.id,
          startAt,
          endAt,
          contactPersonName: body.contact_person_name ?? null,
          contactPersonPhone: body.contact_person_phone ?? null,
          notes: body.notes ?? null,
          status: ShiftStatus.ACTIVE,
        } as Partial<Shift>,
        { transaction },
      );
      if (reqs.length) {
        await ShiftStaffingRequirement.bulkCreate(
          reqs.map((r) => ({
            shiftId: shift.id,
            industrySubCategoryId: r.industry_subcategory_id,
            requiredCount: r.required_count ?? 1,
          })) as never,
          { transaction },
        );
      }
      return shift;
    });

    res.status(201);
    const fresh = await loadShiftWithIncludes(created.id);
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
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid shift id');
    const shift = await assertOwnedShift(req, id);
    const body = req.body ?? {};

    let nextStart = shift.startAt;
    let nextEnd = shift.endAt;
    if (body.start_at !== undefined) nextStart = parseDateOr400(body.start_at, 'start_at');
    if (body.end_at !== undefined) nextEnd = parseDateOr400(body.end_at, 'end_at');
    if (body.start_at !== undefined || body.end_at !== undefined) {
      assertShiftDuration(nextStart, nextEnd);
    }

    const updates: Partial<Shift> = {};
    if (body.start_at !== undefined) updates.startAt = nextStart;
    if (body.end_at !== undefined) updates.endAt = nextEnd;
    if (body.contact_person_name !== undefined) updates.contactPersonName = body.contact_person_name;
    if (body.contact_person_phone !== undefined) updates.contactPersonPhone = body.contact_person_phone;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.status !== undefined) {
      if (!Object.values(ShiftStatus).includes(body.status)) {
        throw new APIError(400, `status must be one of: ${Object.values(ShiftStatus).join(', ')}`);
      }
      updates.status = body.status as ShiftStatus;
    }

    await sequelize.transaction(async (transaction: Transaction) => {
      if (Object.keys(updates).length) {
        await shift.update(updates, { transaction });
      }
      // Replace staffing if provided.
      if (body.staffing_requirements !== undefined) {
        const reqs = await validateStaffingRequirements(body.staffing_requirements);
        await ShiftStaffingRequirement.destroy({ where: { shiftId: shift.id }, transaction });
        if (reqs.length) {
          await ShiftStaffingRequirement.bulkCreate(
            reqs.map((r) => ({
              shiftId: shift.id,
              industrySubCategoryId: r.industry_subcategory_id,
              requiredCount: r.required_count ?? 1,
            })) as never,
            { transaction },
          );
        }
      }
    });

    const fresh = await loadShiftWithIncludes(shift.id);
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
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid shift id');
    const shift = await assertOwnedShift(req, id);
    if (shift.status === ShiftStatus.CANCELLED) {
      throw new APIError(400, 'Shift already cancelled');
    }
    await shift.update({ status: ShiftStatus.CANCELLED });
    const fresh = await loadShiftWithIncludes(shift.id);
    await renderSuccess(res, fresh, ShiftEntity);
  }),
);

export default router;
