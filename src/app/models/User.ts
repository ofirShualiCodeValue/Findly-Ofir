import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  Unique,
  Index,
  CreatedAt,
  UpdatedAt,
  HasOne,
  HasMany,
  BelongsToMany,
} from 'sequelize-typescript';
import { ModelStatic, Transaction } from 'sequelize';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { EmployerProfile } from './EmployerProfile';
import { EmployeeProfile } from './EmployeeProfile';
import { Event } from './Event';
import { EventApplication } from './EventApplication';
import { Notification } from './Notification';
import { PushDevice } from './PushDevice';
import { ActivityArea } from './ActivityArea';
import { EventCategory } from './EventCategory';
import { EmployerActivityArea } from './EmployerActivityArea';
import { EmployerEventCategory } from './EmployerEventCategory';
import { Industry } from './Industry';
import { IndustrySubCategory } from './IndustrySubCategory';
import { UserIndustry } from './UserIndustry';
import { UserIndustrySubCategory } from './UserIndustrySubCategory';
import { Certification } from './Certification';
import { UserCertification } from './UserCertification';

export enum UserRole {
  EMPLOYER = 'employer',
  EMPLOYEE = 'employee',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Table({ tableName: 'users', timestamps: true, underscored: true })
export class User extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare fullName: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare firstName: string | null;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare lastName: string | null;

  @Unique
  @AllowNull(false)
  @Index
  @Column({
    type: DataType.STRING(20),
    // Loose phone format: digits, plus, spaces, dashes, parens, dot.
    // Rejects bogus placeholders like "string" while leaving room for
    // both Israeli (+972...) and local (05...) shapes.
    validate: { is: /^[+\d\s\-().]{7,20}$/ },
  })
  declare phone: string;

  @AllowNull(true)
  @Index
  @Column({
    type: DataType.STRING,
    // Permits null (set by AllowNull) but, when present, must be a real email.
    validate: { isEmail: true },
  })
  declare email: string | null;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(UserRole)))
  declare role: UserRole;

  @AllowNull(false)
  @Default(UserStatus.ACTIVE)
  @Column(DataType.ENUM(...Object.values(UserStatus)))
  declare status: UserStatus;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare notifyEmail: boolean;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare notifySms: boolean;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare notifyPush: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @HasOne(() => EmployerProfile)
  declare employerProfile?: EmployerProfile;

  @HasOne(() => EmployeeProfile)
  declare employeeProfile?: EmployeeProfile;

  @HasMany(() => Event, 'createdByUserId')
  declare createdEvents?: Event[];

  @HasMany(() => EventApplication)
  declare eventApplications?: EventApplication[];

  @HasMany(() => Notification, 'recipientUserId')
  declare notifications?: Notification[];

  @HasMany(() => PushDevice)
  declare pushDevices?: PushDevice[];

  @BelongsToMany(() => ActivityArea, () => EmployerActivityArea)
  declare activityAreas?: ActivityArea[];

  @BelongsToMany(() => EventCategory, () => EmployerEventCategory)
  declare eventCategories?: EventCategory[];

  @BelongsToMany(() => Industry, () => UserIndustry)
  declare industries?: Industry[];

  @BelongsToMany(() => IndustrySubCategory, () => UserIndustrySubCategory)
  declare industrySubCategories?: IndustrySubCategory[];

  @BelongsToMany(() => Certification, () => UserCertification)
  declare certifications?: Certification[];

  // =====================================================================
  // Domain logic — account fields + m:n taxonomy syncs.
  // =====================================================================

  /**
   * Patch the User-level fields shared across roles: name, email, and
   * notification preferences. Caller (handler) supplies a parsed input;
   * fields not present in the input are left untouched.
   */
  async applyAccountUpdates(
    input: {
      fullName?: string;
      firstName?: string;
      lastName?: string;
      email?: string | null;
      notifications?: { email?: boolean; sms?: boolean; push?: boolean };
    },
    options?: { transaction?: Transaction },
  ): Promise<void> {
    const updates: Partial<User> = {};
    if (input.fullName !== undefined) updates.fullName = input.fullName;
    if (input.firstName !== undefined) updates.firstName = input.firstName;
    if (input.lastName !== undefined) updates.lastName = input.lastName;
    if (input.email !== undefined) updates.email = input.email;
    if (input.notifications) {
      if (typeof input.notifications.email === 'boolean') {
        updates.notifyEmail = input.notifications.email;
      }
      if (typeof input.notifications.sms === 'boolean') {
        updates.notifySms = input.notifications.sms;
      }
      if (typeof input.notifications.push === 'boolean') {
        updates.notifyPush = input.notifications.push;
      }
    }
    if (Object.keys(updates).length) {
      await this.update(updates, options);
    }
  }

  // ---- m:n taxonomy syncs -----------------------------------------------

  async setActivityAreas(ids: number[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ActivityArea } = require('./ActivityArea');
    if (ids.length) {
      const found = await ActivityArea.count({ where: { id: ids } });
      if (found !== ids.length) {
        throw new APIError(400, 'One or more area_ids are invalid');
      }
    }
    await User._syncJunction(EmployerActivityArea, this.id, ids, 'activityAreaId');
  }

  async setEventCategories(ids: number[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventCategory } = require('./EventCategory');
    if (ids.length) {
      const found = await EventCategory.count({ where: { id: ids } });
      if (found !== ids.length) {
        throw new APIError(400, 'One or more category_ids are invalid');
      }
    }
    await User._syncJunction(EmployerEventCategory, this.id, ids, 'eventCategoryId');
  }

  async setIndustries(ids: number[]): Promise<void> {
    if (ids.length) {
      const found = await Industry.count({ where: { id: ids } });
      if (found !== ids.length) {
        throw new APIError(400, 'One or more industry_ids are invalid');
      }
    }
    await User._syncJunction(UserIndustry, this.id, ids, 'industryId');
  }

  async setIndustrySubCategories(ids: number[]): Promise<void> {
    if (ids.length) {
      const found = await IndustrySubCategory.count({ where: { id: ids } });
      if (found !== ids.length) {
        throw new APIError(400, 'One or more industry_subcategory_ids are invalid');
      }
    }
    await User._syncJunction(UserIndustrySubCategory, this.id, ids, 'industrySubCategoryId');
  }

  async setCertifications(ids: number[]): Promise<void> {
    if (ids.length) {
      const found = await Certification.count({ where: { id: ids } });
      if (found !== ids.length) {
        throw new APIError(400, 'One or more certification_ids are invalid');
      }
    }
    await User._syncJunction(UserCertification, this.id, ids, 'certificationId');
  }

  /**
   * Generic m:n replace: destroy all rows for the user, then bulk-create
   * the new ones, atomically.
   */
  private static async _syncJunction<T extends Model>(
    Junction: ModelStatic<T>,
    userId: number,
    ids: number[],
    fk: string,
  ): Promise<void> {
    await User.sequelize!.transaction(async (transaction: Transaction) => {
      await Junction.destroy({ where: { userId } as never, transaction });
      if (ids.length) {
        const rows = ids.map((id) => ({ userId, [fk]: id }));
        await Junction.bulkCreate(rows as never, { transaction });
      }
    });
  }

  // =====================================================================
  // Auth-side flows (SMS-OTP signup / role-mismatch guard).
  // =====================================================================

  /** Lookup by phone. Returns null when no user owns this number yet. */
  static async findByPhone(phone: string): Promise<User | null> {
    return User.findOne({ where: { phone } });
  }

  /**
   * Create a User for an OTP-verified phone, plus the matching
   * role-specific profile (EmployerProfile or EmployeeProfile). Called
   * by `POST /v1/shared/auth/register` after the registration token has
   * been validated. Throws 409 if a user already exists for the phone
   * (race condition / replay).
   */
  static async completeSignup(input: {
    phone: string;
    fullName: string;
    role: UserRole;
  }): Promise<User> {
    const existing = await User.findOne({ where: { phone: input.phone } });
    if (existing) {
      throw new APIError(409, 'A user already exists for this phone');
    }
    if (!Object.values(UserRole).includes(input.role)) {
      throw new APIError(400, 'role must be employer or employee');
    }

    const created = await User.create({
      phone: input.phone,
      fullName: input.fullName,
      role: input.role,
      status: UserStatus.ACTIVE,
    } as Partial<User>);

    // Lazy import the profile models to avoid a circular dep at model
    // registration time.
    if (input.role === UserRole.EMPLOYER) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmployerProfile } = require('./EmployerProfile');
      await EmployerProfile.create({
        userId: created.id,
        businessName: input.fullName,
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmployeeProfile } = require('./EmployeeProfile');
      await EmployeeProfile.create({ userId: created.id });
    }

    return created;
  }

  // =====================================================================
  // Employee-side flows.
  // =====================================================================

  /**
   * Single-shot employee registration. Atomically updates the User row,
   * the EmployeeProfile row, and the industry / sub-category junctions.
   * Caller (handler) is expected to have validated input shape (age,
   * work_status enum, coords, numeric bounds) and resolved the home
   * coordinates (geocoding from `home_city` is a handler concern).
   */
  async completeEmployeeRegistration(input: {
    firstName?: string;
    lastName?: string;
    dateOfBirth: string;
    workStatus: 'freelancer' | 'salaried';
    locationRangeKm: number;
    baseHourlyRate: number;
    homeCity?: string | null;
    homeLatitude: number;
    homeLongitude: number;
    industryIds?: number[];
    industrySubCategoryIds?: number[];
  }): Promise<void> {
    // FK existence — state-dependent, not pure input validation.
    if (input.industryIds?.length) {
      const found = await Industry.count({ where: { id: input.industryIds } });
      if (found !== input.industryIds.length) {
        throw new APIError(400, 'One or more industry_ids are invalid');
      }
    }
    if (input.industrySubCategoryIds?.length) {
      const found = await IndustrySubCategory.count({
        where: { id: input.industrySubCategoryIds },
      });
      if (found !== input.industrySubCategoryIds.length) {
        throw new APIError(400, 'One or more industry_subcategory_ids are invalid');
      }
    }

    await User.sequelize!.transaction(async (transaction: Transaction) => {
      const userUpdates: Partial<User> = {};
      if (input.firstName !== undefined) userUpdates.firstName = input.firstName;
      if (input.lastName !== undefined) userUpdates.lastName = input.lastName;
      if (input.firstName || input.lastName) {
        const composed = `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim();
        if (composed) userUpdates.fullName = composed;
      }
      if (Object.keys(userUpdates).length) {
        await this.update(userUpdates, { transaction });
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmployeeProfile } = require('./EmployeeProfile');
      const profile = await EmployeeProfile.findForUserOrThrow(this.id, { transaction });
      await profile.update(
        {
          dateOfBirth: input.dateOfBirth,
          workStatus: input.workStatus,
          locationRangeKm: input.locationRangeKm,
          baseHourlyRate: String(input.baseHourlyRate),
          homeLatitude: String(input.homeLatitude),
          homeLongitude: String(input.homeLongitude),
          homeCity: input.homeCity ? String(input.homeCity) : null,
        },
        { transaction },
      );

      // Replace industries + sub-categories.
      await UserIndustry.destroy({ where: { userId: this.id }, transaction });
      if (input.industryIds?.length) {
        await UserIndustry.bulkCreate(
          input.industryIds.map((id) => ({ userId: this.id, industryId: id })) as never,
          { transaction },
        );
      }
      await UserIndustrySubCategory.destroy({ where: { userId: this.id }, transaction });
      if (input.industrySubCategoryIds?.length) {
        await UserIndustrySubCategory.bulkCreate(
          input.industrySubCategoryIds.map((id) => ({
            userId: this.id,
            industrySubCategoryId: id,
          })) as never,
          { transaction },
        );
      }
    });
  }

  // =====================================================================
  // Employer-side flows.
  // =====================================================================

  /**
   * Single-shot employer registration. Atomically updates the User row
   * (full_name, contact email), the EmployerProfile (business name,
   * owner, vat, address), and the activity-area / event-category /
   * industry junctions. Caller (handler) supplies a parsed input.
   * Throws when any FK is invalid or the EmployerProfile row is
   * missing (which would mean the user wasn't created via the
   * standard signup flow).
   */
  async completeEmployerRegistration(input: {
    fullName?: string;
    businessName: string;
    ownerName?: string | null;
    vatNumber?: string | null;
    contactEmail?: string | null;
    address: string;
    activityAreaIds: number[];
    eventCategoryIds: number[];
    industryIds: number[];
  }): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ActivityArea } = require('./ActivityArea');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventCategory } = require('./EventCategory');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EmployerProfile } = require('./EmployerProfile');

    // FK existence — state-dependent.
    if (input.activityAreaIds.length) {
      const found = await ActivityArea.count({ where: { id: input.activityAreaIds } });
      if (found !== input.activityAreaIds.length) {
        throw new APIError(400, 'One or more activity_area_ids are invalid');
      }
    }
    if (input.eventCategoryIds.length) {
      const found = await EventCategory.count({ where: { id: input.eventCategoryIds } });
      if (found !== input.eventCategoryIds.length) {
        throw new APIError(400, 'One or more event_category_ids are invalid');
      }
    }
    if (input.industryIds.length) {
      const found = await Industry.count({ where: { id: input.industryIds } });
      if (found !== input.industryIds.length) {
        throw new APIError(400, 'One or more industry_ids are invalid');
      }
    }

    await User.sequelize!.transaction(async (transaction: Transaction) => {
      if (input.fullName !== undefined) {
        await this.update({ fullName: input.fullName }, { transaction });
      }

      const profile = await EmployerProfile.findOne({
        where: { userId: this.id },
        transaction,
      });
      if (!profile) {
        throw new APIError(404, 'Employer profile not found');
      }
      await profile.update(
        {
          businessName: input.businessName,
          ownerName: input.ownerName ?? null,
          vatNumber: input.vatNumber ?? null,
          contactEmail: input.contactEmail ?? null,
          // contact_phone deliberately follows user.phone — no separate
          // input. Persisted here so the entity rendering stays simple.
          contactPhone: this.phone,
          address: input.address,
        },
        { transaction },
      );

      // Replace activity areas + event categories + industries.
      await EmployerActivityArea.destroy({ where: { userId: this.id }, transaction });
      if (input.activityAreaIds.length) {
        await EmployerActivityArea.bulkCreate(
          input.activityAreaIds.map((id) => ({
            userId: this.id,
            activityAreaId: id,
          })) as never,
          { transaction },
        );
      }

      await EmployerEventCategory.destroy({ where: { userId: this.id }, transaction });
      if (input.eventCategoryIds.length) {
        await EmployerEventCategory.bulkCreate(
          input.eventCategoryIds.map((id) => ({
            userId: this.id,
            eventCategoryId: id,
          })) as never,
          { transaction },
        );
      }

      await UserIndustry.destroy({ where: { userId: this.id }, transaction });
      if (input.industryIds.length) {
        await UserIndustry.bulkCreate(
          input.industryIds.map((id) => ({
            userId: this.id,
            industryId: id,
          })) as never,
          { transaction },
        );
      }
    });
  }
}
