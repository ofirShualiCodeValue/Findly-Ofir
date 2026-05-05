import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  Index,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { User } from './User';
import { EventCategory } from './EventCategory';
import { ActivityArea } from './ActivityArea';
import { EventApplication } from './EventApplication';
import { Notification } from './Notification';
import { IndustrySubCategory } from './IndustrySubCategory';
import { Shift } from './Shift';

export enum EventStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

/**
 * Parsed input the handler hands off to `Event.createForOwner`. The handler
 * is responsible for input-shape validation (missing fields, date parsing,
 * numeric bounds, enum membership) — this type encodes the post-validation
 * shape. State-dependent rules (FK existence, end > start) are enforced in
 * the model.
 */
export interface EventCreateInput {
  name: string;
  description?: string | null;
  venue?: string | null;
  startAt: Date;
  endAt: Date;
  budget?: string;
  requiredEmployees?: number;
  eventCategoryId: number;
  activityAreaId: number;
  status?: EventStatus;
}

/** Same as create, but every field optional — for partial PATCH. */
export type EventUpdateInput = Partial<EventCreateInput>;

@Table({ tableName: 'events', timestamps: true, underscored: true })
export class Event extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare createdByUserId: number;

  @ForeignKey(() => EventCategory)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare eventCategoryId: number;

  @ForeignKey(() => ActivityArea)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare activityAreaId: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare description: string | null;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare venue: string | null;

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  declare startAt: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  declare endAt: Date;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  declare budget: string;

  @AllowNull(false)
  @Default(1)
  @Column(DataType.INTEGER)
  declare requiredEmployees: number;

  @AllowNull(false)
  @Default(EventStatus.DRAFT)
  @Index
  @Column(DataType.ENUM(...Object.values(EventStatus)))
  declare status: EventStatus;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare latitude: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare longitude: string | null;

  // Column is `industry_subcategory_id` (one word) — see note in
  // UserIndustrySubCategory.ts.
  @ForeignKey(() => IndustrySubCategory)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER, field: 'industry_subcategory_id' })
  declare industrySubCategoryId: number | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare creator?: User;

  @BelongsTo(() => EventCategory)
  declare eventCategory?: EventCategory;

  @BelongsTo(() => ActivityArea)
  declare activityArea?: ActivityArea;

  @BelongsTo(() => IndustrySubCategory)
  declare industrySubCategory?: IndustrySubCategory;

  @HasMany(() => Shift)
  declare shifts?: Shift[];

  @HasMany(() => EventApplication)
  declare applications?: EventApplication[];

  @HasMany(() => Notification)
  declare notifications?: Notification[];

  // =====================================================================
  // Domain logic — business rules that depend on persisted state. Handlers
  // remain thin (parsing + delegation); model owns the rules.
  // =====================================================================

  /** True iff the event has been soft-cancelled. Used as an edit/cancel guard. */
  get isCancelled(): boolean {
    return this.status === EventStatus.CANCELLED;
  }

  /**
   * Apply a partial update. Enforces the cancellation guard, the
   * end-after-start ordering against the resulting time range, and any
   * FK existence checks required by changed references.
   */
  async applyUpdates(input: EventUpdateInput): Promise<void> {
    if (this.isCancelled) {
      throw new APIError(400, 'Cannot edit a cancelled event');
    }

    const finalStart = input.startAt ?? this.startAt;
    const finalEnd = input.endAt ?? this.endAt;
    if (finalEnd <= finalStart) {
      throw new APIError(400, 'end_at must be after start_at');
    }

    if (input.eventCategoryId !== undefined) {
      await Event.assertCategoryExists(input.eventCategoryId);
    }
    if (input.activityAreaId !== undefined) {
      await Event.assertAreaExists(input.activityAreaId);
    }

    await this.update(input);
  }

  /**
   * Soft-cancel the event. The cancellation guard is applied here so the
   * caller cannot accidentally cancel twice.
   */
  async cancel(): Promise<void> {
    if (this.isCancelled) {
      throw new APIError(400, 'Event already cancelled');
    }
    await this.update({ status: EventStatus.CANCELLED });
  }

  /**
   * Create an event owned by `userId`. Enforces end-after-start and FK
   * existence before persisting. Returns the freshly created row (without
   * eager-loaded relations — caller decides what to include for the
   * response).
   */
  static async createForOwner(userId: number, input: EventCreateInput): Promise<Event> {
    if (input.endAt <= input.startAt) {
      throw new APIError(400, 'end_at must be after start_at');
    }
    await Event.assertCategoryExists(input.eventCategoryId);
    await Event.assertAreaExists(input.activityAreaId);

    return Event.create({
      createdByUserId: userId,
      eventCategoryId: input.eventCategoryId,
      activityAreaId: input.activityAreaId,
      name: input.name,
      description: input.description ?? null,
      venue: input.venue ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      budget: input.budget ?? '0',
      requiredEmployees: input.requiredEmployees ?? 1,
      status: input.status ?? EventStatus.DRAFT,
    } as Partial<Event>);
  }

  static async assertCategoryExists(id: number): Promise<void> {
    const found = await EventCategory.findByPk(id);
    if (!found) throw new APIError(400, 'Invalid event_category_id');
  }

  static async assertAreaExists(id: number): Promise<void> {
    const found = await ActivityArea.findByPk(id);
    if (!found) throw new APIError(400, 'Invalid activity_area_id');
  }

  /**
   * Active event for the worker-facing feed; throws 404 when missing or
   * not in the `active` status.
   */
  static async findActiveOrThrow(eventId: number): Promise<Event> {
    const event = await Event.findOne({
      where: { id: eventId, status: EventStatus.ACTIVE },
    });
    if (!event) throw new APIError(404, 'Event not found or not open');
    return event;
  }

  /**
   * Capacity rollup for the event: a `state` per shift per role plus an
   * event-level summary. Powers the capacity dashboard the employer sees
   * on the event details screen.
   */
  async capacityBreakdown(): Promise<CapacityBreakdown> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Shift } = require('./Shift');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ShiftStaffingRequirement } = require('./ShiftStaffingRequirement');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IndustrySubCategory } = require('./IndustrySubCategory');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventApplication, EventApplicationStatus } = require('./EventApplication');

    const shifts = await Shift.findAll({
      where: { eventId: this.id },
      include: [
        {
          model: ShiftStaffingRequirement,
          include: [{ model: IndustrySubCategory }],
        },
      ],
      order: [['startAt', 'ASC']],
    });

    const approvedApps = await EventApplication.findAll({
      where: { eventId: this.id, status: EventApplicationStatus.APPROVED },
      attributes: ['id', 'shiftId', 'userId'],
      include: [
        {
          model: User,
          as: 'applicant',
          include: [
            {
              model: IndustrySubCategory,
              attributes: ['id'],
              through: { attributes: [] },
            },
          ],
        },
      ],
    });

    const stateOf = (filled: number, required: number): 'under' | 'met' | 'over' => {
      if (required <= 0) return filled > 0 ? 'over' : 'under';
      if (filled < required) return 'under';
      if (filled === required) return 'met';
      return 'over';
    };

    type ShiftRow = {
      id: number;
      startAt: Date;
      endAt: Date;
      staffingRequirements?: Array<{
        requiredCount: number;
        industrySubCategoryId: number;
        industrySubCategory?: { id: number; name: string; slug: string };
      }>;
    };
    type AppRow = {
      id: number;
      shiftId: number | null;
      userId: number;
      applicant?: { industrySubCategories?: Array<{ id: number }> };
    };

    const shiftBreakdowns = (shifts as ShiftRow[]).map((shift) => {
      const reqs = shift.staffingRequirements ?? [];
      const totalRequired = reqs.reduce((s, r) => s + r.requiredCount, 0);
      const filledForShift = (approvedApps as AppRow[]).filter((a) => a.shiftId === shift.id);
      const totalFilled = filledForShift.length;

      const perRole = reqs.map((r) => {
        const filled = filledForShift.filter((a) => {
          const subs = a.applicant?.industrySubCategories ?? [];
          return subs.some((s) => s.id === r.industrySubCategoryId);
        }).length;
        return {
          industry_subcategory_id: r.industrySubCategoryId,
          industry_subcategory: r.industrySubCategory
            ? {
                id: r.industrySubCategory.id,
                name: r.industrySubCategory.name,
                slug: r.industrySubCategory.slug,
              }
            : null,
          required: r.requiredCount,
          filled,
          state: stateOf(filled, r.requiredCount),
        };
      });

      return {
        shift_id: shift.id,
        start_at: shift.startAt,
        end_at: shift.endAt,
        total_required: totalRequired,
        total_filled: totalFilled,
        state: stateOf(totalFilled, totalRequired),
        per_role: perRole,
      };
    });

    const eventRequired = shiftBreakdowns.reduce((s, b) => s + b.total_required, 0);
    const eventFilled = (approvedApps as AppRow[]).length;

    return {
      event_id: this.id,
      total_required: eventRequired,
      total_filled: eventFilled,
      state: stateOf(eventFilled, eventRequired),
      shifts: shiftBreakdowns,
    };
  }
}

interface CapacityBreakdown {
  event_id: number;
  total_required: number;
  total_filled: number;
  state: 'under' | 'met' | 'over';
  shifts: Array<{
    shift_id: number;
    start_at: Date;
    end_at: Date;
    total_required: number;
    total_filled: number;
    state: 'under' | 'met' | 'over';
    per_role: Array<{
      industry_subcategory_id: number;
      industry_subcategory: { id: number; name: string; slug: string } | null;
      required: number;
      filled: number;
      state: 'under' | 'met' | 'over';
    }>;
  }>;
}
