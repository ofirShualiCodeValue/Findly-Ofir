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
import { Transaction } from 'sequelize';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Event } from './Event';
import { ShiftStaffingRequirement } from './ShiftStaffingRequirement';
import { EventApplication } from './EventApplication';
import { IndustrySubCategory } from './IndustrySubCategory';

export enum ShiftStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

/** Israeli labor convention used by the Findly product spec. */
const MIN_SHIFT_HOURS = 6;
const MAX_SHIFT_HOURS = 12;

/** Parsed shift create input — handler does string→Date and FK lookups. */
export interface ShiftCreateInput {
  startAt: Date;
  endAt: Date;
  contactPersonName?: string | null;
  contactPersonPhone?: string | null;
  notes?: string | null;
  staffingRequirements?: StaffingRequirementInput[];
}

/** Same as create but every field optional — for partial PATCH. */
export type ShiftUpdateInput = Partial<ShiftCreateInput>;

/** A single role × headcount line on a shift's staffing plan. */
export interface StaffingRequirementInput {
  industrySubCategoryId: number;
  requiredCount?: number;
}

@Table({ tableName: 'shifts', timestamps: true, underscored: true })
export class Shift extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Event)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare eventId: number;

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  declare startAt: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  declare endAt: Date;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare contactPersonName: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  declare contactPersonPhone: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare notes: string | null;

  @AllowNull(false)
  @Default(ShiftStatus.ACTIVE)
  @Index
  @Column(DataType.ENUM(...Object.values(ShiftStatus)))
  declare status: ShiftStatus;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Event)
  declare event?: Event;

  @HasMany(() => ShiftStaffingRequirement)
  declare staffingRequirements?: ShiftStaffingRequirement[];

  @HasMany(() => EventApplication)
  declare applications?: EventApplication[];

  // =====================================================================
  // Domain logic — duration rule (6-12h), staffing sync, soft cancel.
  // =====================================================================

  get isCancelled(): boolean {
    return this.status === ShiftStatus.CANCELLED;
  }

  /**
   * Enforces Findly's labor-spec rule: shift duration must be 6–12 hours
   * and `endAt` must be strictly after `startAt`. Throws an `APIError`
   * with a `SHIFT_DURATION_INVALID` payload so the Flutter "Invalid
   * Duration" popup can render the actual numbers.
   */
  static assertValidDuration(startAt: Date, endAt: Date): void {
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

  /**
   * Persists a new shift on the given event. Atomically writes the shift
   * row and any staffing requirements in a single transaction.
   */
  static async createForEvent(eventId: number, input: ShiftCreateInput): Promise<Shift> {
    Shift.assertValidDuration(input.startAt, input.endAt);
    await Shift.assertStaffingFKsExist(input.staffingRequirements ?? []);

    return Shift.sequelize!.transaction(async (transaction: Transaction) => {
      const shift = await Shift.create(
        {
          eventId,
          startAt: input.startAt,
          endAt: input.endAt,
          contactPersonName: input.contactPersonName ?? null,
          contactPersonPhone: input.contactPersonPhone ?? null,
          notes: input.notes ?? null,
          status: ShiftStatus.ACTIVE,
        } as Partial<Shift>,
        { transaction },
      );
      if (input.staffingRequirements && input.staffingRequirements.length) {
        await ShiftStaffingRequirement.bulkCreate(
          input.staffingRequirements.map((r) => ({
            shiftId: shift.id,
            industrySubCategoryId: r.industrySubCategoryId,
            requiredCount: r.requiredCount ?? 1,
          })) as never,
          { transaction },
        );
      }
      return shift;
    });
  }

  /**
   * Apply a partial update to the shift. If `startAt` or `endAt` is in the
   * patch, the resulting time range is re-validated. Passing
   * `staffingRequirements` replaces the full set atomically.
   */
  async applyUpdates(input: ShiftUpdateInput): Promise<void> {
    const nextStart = input.startAt ?? this.startAt;
    const nextEnd = input.endAt ?? this.endAt;
    if (input.startAt !== undefined || input.endAt !== undefined) {
      Shift.assertValidDuration(nextStart, nextEnd);
    }
    if (input.staffingRequirements !== undefined) {
      await Shift.assertStaffingFKsExist(input.staffingRequirements);
    }

    const fieldUpdates: Partial<Shift> = {};
    if (input.startAt !== undefined) fieldUpdates.startAt = input.startAt;
    if (input.endAt !== undefined) fieldUpdates.endAt = input.endAt;
    if (input.contactPersonName !== undefined) {
      fieldUpdates.contactPersonName = input.contactPersonName;
    }
    if (input.contactPersonPhone !== undefined) {
      fieldUpdates.contactPersonPhone = input.contactPersonPhone;
    }
    if (input.notes !== undefined) fieldUpdates.notes = input.notes;

    await Shift.sequelize!.transaction(async (transaction: Transaction) => {
      if (Object.keys(fieldUpdates).length) {
        await this.update(fieldUpdates, { transaction });
      }
      if (input.staffingRequirements !== undefined) {
        await ShiftStaffingRequirement.destroy({
          where: { shiftId: this.id },
          transaction,
        });
        if (input.staffingRequirements.length) {
          await ShiftStaffingRequirement.bulkCreate(
            input.staffingRequirements.map((r) => ({
              shiftId: this.id,
              industrySubCategoryId: r.industrySubCategoryId,
              requiredCount: r.requiredCount ?? 1,
            })) as never,
            { transaction },
          );
        }
      }
    });
  }

  /** Soft-cancel the shift; throws if it's already cancelled. */
  async cancel(): Promise<void> {
    if (this.isCancelled) {
      throw new APIError(400, 'Shift already cancelled');
    }
    await this.update({ status: ShiftStatus.CANCELLED });
  }

  /**
   * Verifies every `industrySubCategoryId` referenced by the requirements
   * actually exists. Caller (handler) is expected to have already checked
   * input shape (positive integers, no duplicates).
   */
  static async assertStaffingFKsExist(
    requirements: StaffingRequirementInput[],
  ): Promise<void> {
    if (!requirements.length) return;
    const ids = requirements.map((r) => r.industrySubCategoryId);
    const found = await IndustrySubCategory.count({ where: { id: ids } });
    if (found !== ids.length) {
      throw new APIError(400, 'One or more industry_subcategory_id values are invalid');
    }
  }
}
