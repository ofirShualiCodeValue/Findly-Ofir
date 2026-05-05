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
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Event } from './Event';
import { User } from './User';
import { Shift } from './Shift';

export enum EventApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED_BY_EMPLOYEE = 'cancelled_by_employee',
  CANCELLED_BY_EMPLOYER = 'cancelled_by_employer',
}

export enum HoursStatus {
  NOT_REPORTED = 'not_reported',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Table({ tableName: 'event_applications', timestamps: true, underscored: true })
export class EventApplication extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Event)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare eventId: number;

  @ForeignKey(() => Shift)
  @AllowNull(true)
  @Index
  @Column(DataType.INTEGER)
  declare shiftId: number | null;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare userId: number;

  @AllowNull(false)
  @Default(EventApplicationStatus.PENDING)
  @Index
  @Column(DataType.ENUM(...Object.values(EventApplicationStatus)))
  declare status: EventApplicationStatus;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare decidedAt: Date | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  declare decidedByUserId: number | null;

  @AllowNull(true)
  @Index
  @Column(DataType.DECIMAL(12, 2))
  declare proposedAmount: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare note: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(5, 2))
  declare reportedHours: string | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare reportedStartAt: Date | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare reportedEndAt: Date | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare reportedAt: Date | null;

  @AllowNull(false)
  @Default(HoursStatus.NOT_REPORTED)
  @Column(DataType.ENUM(...Object.values(HoursStatus)))
  declare hoursStatus: HoursStatus;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Event)
  declare event?: Event;

  @BelongsTo(() => Shift)
  declare shift?: Shift;

  @BelongsTo(() => User, 'userId')
  declare applicant?: User;

  @BelongsTo(() => User, 'decidedByUserId')
  declare decider?: User;

  // =====================================================================
  // Domain logic — business rules over persisted application state.
  // =====================================================================

  /**
   * Statuses past which an employer cannot move the application back —
   * except via the explicit `cancelled_by_employer` escape hatch handled
   * inside `decide`.
   */
  static readonly TERMINAL_STATUSES: ReadonlySet<EventApplicationStatus> = new Set([
    EventApplicationStatus.APPROVED,
    EventApplicationStatus.REJECTED,
    EventApplicationStatus.CANCELLED_BY_EMPLOYEE,
    EventApplicationStatus.CANCELLED_BY_EMPLOYER,
  ]);

  get isApproved(): boolean {
    return this.status === EventApplicationStatus.APPROVED;
  }

  get isInTerminalState(): boolean {
    return EventApplication.TERMINAL_STATUSES.has(this.status);
  }

  /**
   * Apply an employer decision (approve / reject / cancel-by-employer).
   * Cannot leave a terminal status, except by reaching the explicit
   * `cancelled_by_employer` escape hatch.
   */
  async decide(by: {
    userId: number;
    status: EventApplicationStatus;
    note?: string | null;
  }): Promise<void> {
    const isEscapeHatch = by.status === EventApplicationStatus.CANCELLED_BY_EMPLOYER;
    if (!isEscapeHatch && this.isInTerminalState) {
      throw new APIError(400, `Cannot change status from ${this.status}`);
    }
    await this.update({
      status: by.status,
      note: by.note ?? this.note,
      decidedAt: new Date(),
      decidedByUserId: by.userId,
    });
  }

  /**
   * Throws when the application isn't eligible for rating: must be
   * approved AND its event must have already ended. Caller (handler)
   * is expected to have eager-loaded `event`.
   */
  assertRateable(): void {
    if (!this.isApproved) {
      throw new APIError(409, 'Only approved applications can be rated');
    }
    if (!this.event || new Date(this.event.endAt).getTime() > Date.now()) {
      throw new APIError(409, 'The shift has not ended yet');
    }
  }

  // ---- employee-side flows ----------------------------------------------

  /**
   * Worker applies to an `active` event with a proposed amount. Throws
   * 404 when the event isn't open, 409 when the worker has already
   * applied. Returns the freshly-created application (no eager loads —
   * caller decides which entity to render).
   */
  static async applyToEvent(
    eventId: number,
    userId: number,
    input: { proposedAmount: number; note?: string | null },
  ): Promise<EventApplication> {
    // Lazy import to avoid a circular dep with Event.ts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Event, EventStatus } = require('./Event');
    const event = await Event.findOne({
      where: { id: eventId, status: EventStatus.ACTIVE },
    });
    if (!event) {
      throw new APIError(404, 'Event not found or not open');
    }
    const existing = await EventApplication.findOne({
      where: { eventId, userId },
    });
    if (existing) {
      throw new APIError(409, 'You have already applied to this event');
    }
    return EventApplication.create({
      eventId,
      userId,
      status: EventApplicationStatus.PENDING,
      proposedAmount: String(input.proposedAmount),
      note: input.note ?? null,
    } as Partial<EventApplication>);
  }

  /**
   * 48-hour cancellation policy: when there's less than 48h until the
   * shift starts, the first call throws `CANCELLATION_POLICY_LATE` with
   * `hours_until_shift` in the payload so the Flutter "Cancellation
   * Policy" popup can show. The client confirms with `force=true` to
   * push through.
   *
   * Caller is expected to have eager-loaded `event`.
   */
  async cancelByEmployee(opts: { force: boolean }): Promise<void> {
    if (this.status === EventApplicationStatus.CANCELLED_BY_EMPLOYEE) {
      throw new APIError(400, 'Already cancelled');
    }
    if (this.event && !opts.force) {
      const startMs = new Date(this.event.startAt).getTime();
      const hoursUntil = (startMs - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil > 0 && hoursUntil < 48) {
        throw new APIError(409, 'Cancellation within 48 hours of the shift', {
          code: 'CANCELLATION_POLICY_LATE',
          policy_threshold_hours: 48,
          hours_until_shift: Math.round(hoursUntil * 100) / 100,
        });
      }
    }
    await this.update({
      status: EventApplicationStatus.CANCELLED_BY_EMPLOYEE,
      decidedAt: new Date(),
    });
  }

  /**
   * Worker reports the actual time range they worked after the shift ends.
   * Only allowed on approved applications whose event has ended, and whose
   * hours haven't already been approved. Sets `hoursStatus` to
   * `pending_approval` until the employer confirms.
   *
   * `reportedHours` is computed from the time range and stored alongside
   * for consumers (Flutter UI, earnings rollup) that don't want to
   * re-derive it on every read.
   *
   * Caller is expected to have eager-loaded `event`.
   */
  async reportShiftTimes(input: { startAt: Date; endAt: Date }): Promise<void> {
    if (!this.isApproved) {
      throw new APIError(409, 'Only approved applications can report hours');
    }
    if (this.hoursStatus === HoursStatus.APPROVED) {
      throw new APIError(409, 'Hours have already been approved by the employer');
    }
    if (!this.event || new Date(this.event.endAt).getTime() > Date.now()) {
      throw new APIError(409, 'The shift has not ended yet');
    }
    EventApplication.assertShiftRange(input.startAt, input.endAt);

    await this.update({
      reportedStartAt: input.startAt,
      reportedEndAt: input.endAt,
      reportedHours: EventApplication.computeHours(input.startAt, input.endAt),
      reportedAt: new Date(),
      hoursStatus: HoursStatus.PENDING_APPROVAL,
    });
  }

  /**
   * Employer decides on the worker's reported hours. Three modes:
   *   - approve as-is:  decideHours({ status: 'approved' })
   *   - approve + edit: decideHours({ status: 'approved', startAt, endAt })
   *   - reject:         decideHours({ status: 'rejected' })
   *
   * "Edit" overwrites the reported time range with whatever the employer
   * chose, so the row reflects the final billable times after the call.
   */
  async decideHours(input: {
    status: HoursStatus.APPROVED | HoursStatus.REJECTED;
    startAt?: Date;
    endAt?: Date;
  }): Promise<void> {
    if (this.hoursStatus !== HoursStatus.PENDING_APPROVAL) {
      throw new APIError(
        409,
        `Cannot decide hours from status '${this.hoursStatus}' — must be 'pending_approval'`,
      );
    }

    const hasEdit = input.startAt !== undefined || input.endAt !== undefined;
    if (hasEdit && input.status !== HoursStatus.APPROVED) {
      throw new APIError(400, 'Time edits are only allowed when status=approved');
    }
    if (hasEdit && (input.startAt === undefined || input.endAt === undefined)) {
      throw new APIError(400, 'Both start_at and end_at are required when editing times');
    }

    if (hasEdit) {
      EventApplication.assertShiftRange(input.startAt!, input.endAt!);
      await this.update({
        reportedStartAt: input.startAt!,
        reportedEndAt: input.endAt!,
        reportedHours: EventApplication.computeHours(input.startAt!, input.endAt!),
        hoursStatus: input.status,
      });
      return;
    }
    await this.update({ hoursStatus: input.status });
  }

  /**
   * Validate a reported shift range. End must be strictly after start, and
   * the total duration must be sensible for a single shift (≤ 24h).
   */
  private static assertShiftRange(startAt: Date, endAt: Date): void {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new APIError(400, 'Invalid start_at / end_at');
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new APIError(400, 'end_at must be after start_at');
    }
    const hours = (endAt.getTime() - startAt.getTime()) / 3_600_000;
    if (hours > 24) {
      throw new APIError(400, 'Reported shift cannot exceed 24 hours');
    }
  }

  /** Decimal-string hours, rounded to 2 decimals. */
  private static computeHours(startAt: Date, endAt: Date): string {
    const hours = (endAt.getTime() - startAt.getTime()) / 3_600_000;
    return (Math.round(hours * 100) / 100).toFixed(2);
  }

  /**
   * Sums `proposed_amount` over the worker's approved applications,
   * bucketed by event start month. Powers the "הכנסות חודשיות" card on
   * the employee profile.
   */
  static async earningsFor(userId: number): Promise<{
    current_month: number;
    previous_month: number;
    total: number;
    approved_application_count: number;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Event } = require('./Event');
    const now = new Date();
    const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
    const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const apps = await EventApplication.findAll({
      where: { userId, status: EventApplicationStatus.APPROVED },
      include: [{ model: Event, attributes: ['id', 'startAt'], required: true }],
    });

    let current = 0;
    let previous = 0;
    let total = 0;
    for (const a of apps) {
      const amount = Number(a.proposedAmount ?? 0);
      if (!Number.isFinite(amount)) continue;
      total += amount;
      const startAt = a.event?.startAt ? new Date(a.event.startAt) : null;
      if (!startAt) continue;
      if (startAt >= startCurrent && startAt < startNext) current += amount;
      else if (startAt >= startPrevious && startAt < startCurrent) previous += amount;
    }

    return {
      current_month: Math.round(current * 100) / 100,
      previous_month: Math.round(previous * 100) / 100,
      total: Math.round(total * 100) / 100,
      approved_application_count: apps.length,
    };
  }
}
