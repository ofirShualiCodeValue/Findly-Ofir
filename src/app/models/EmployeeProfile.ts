import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Index,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { User } from './User';

export interface EmployeeProfileUpdateInput {
  idNumber?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  bankName?: string | null;
  dateOfBirth?: string | null;
  workStatus?: WorkStatus | null;
  baseHourlyRate?: string | null;
  locationRangeKm?: number | null;
  homeCity?: string | null;
  homeLatitude?: string | null;
  homeLongitude?: string | null;
  avatarUrl?: string | null;
}

export enum WorkStatus {
  FREELANCER = 'freelancer',
  SALARIED = 'salaried',
}

@Table({ tableName: 'employee_profiles', timestamps: true, underscored: true })
export class EmployeeProfile extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @Unique
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare userId: number;

  @AllowNull(true)
  @Index
  @Column(DataType.STRING(9))
  declare idNumber: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  declare bankAccountNumber: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(10))
  declare bankBranch: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  declare bankName: string | null;

  @AllowNull(true)
  @Column(DataType.DATEONLY)
  declare dateOfBirth: string | null;

  @AllowNull(true)
  @Column(DataType.ENUM(...Object.values(WorkStatus)))
  declare workStatus: WorkStatus | null;

  @AllowNull(true)
  @Column(DataType.STRING(2048))
  declare avatarUrl: string | null;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  declare locationRangeKm: number | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(8, 2))
  declare baseHourlyRate: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare homeLatitude: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare homeLongitude: string | null;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare homeCity: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user?: User;

  // =====================================================================
  // Domain logic — partial updates + finder + avatar URL setter.
  // =====================================================================

  /**
   * Find the profile that belongs to `userId`. Throws 404 if missing —
   * which means the profile row wasn't created at signup, an invariant
   * the SMS-OTP flow guarantees today.
   */
  static async findForUserOrThrow(
    userId: number,
    options?: { transaction?: Transaction },
  ): Promise<EmployeeProfile> {
    const profile = await EmployeeProfile.findOne({ where: { userId }, ...options });
    if (!profile) throw new APIError(404, 'Employee profile not found');
    return profile;
  }

  /**
   * Apply a partial update. Only fields present in `input` are written —
   * caller (handler) is responsible for input-shape checks (work_status
   * enum, coordinate ranges, numeric bounds).
   */
  async applyUpdates(
    input: EmployeeProfileUpdateInput,
    options?: { transaction?: Transaction },
  ): Promise<void> {
    if (Object.keys(input).length) {
      await this.update(input, options);
    }
  }

  /** Persist a freshly-uploaded avatar URL. */
  async setAvatarUrl(url: string): Promise<void> {
    await this.update({ avatarUrl: url });
  }
}
