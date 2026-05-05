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
import { geocodeIsraeliCity } from '../api/helpers/geocoding';
import { User } from './User';

export interface EmployerProfileUpdateInput {
  businessName?: string;
  ownerName?: string | null;
  vatNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

@Table({ tableName: 'employer_profiles', timestamps: true, underscored: true })
export class EmployerProfile extends Model {
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

  @AllowNull(false)
  @Column(DataType.STRING)
  declare businessName: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare ownerName: string | null;

  @AllowNull(true)
  @Index
  @Column(DataType.STRING(20))
  declare vatNumber: string | null;

  @AllowNull(true)
  @Column({
    type: DataType.STRING,
    validate: { isEmail: true },
  })
  declare contactEmail: string | null;

  @AllowNull(true)
  @Column({
    type: DataType.STRING(20),
    validate: { is: /^[+\d\s\-().]{7,20}$/ },
  })
  declare contactPhone: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare address: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(2048))
  declare logoUrl: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare latitude: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare longitude: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user?: User;

  // =====================================================================
  // Domain logic — partial updates with auto-geocode + ownership lookup.
  // =====================================================================

  /**
   * Find the profile that belongs to `userId`. Throws 404 if missing —
   * which means the profile row wasn't created at signup, an invariant
   * the SMS-OTP flow guarantees today.
   */
  static async findForUserOrThrow(
    userId: number,
    options?: { transaction?: Transaction },
  ): Promise<EmployerProfile> {
    const profile = await EmployerProfile.findOne({ where: { userId }, ...options });
    if (!profile) throw new APIError(404, 'Employer profile not found');
    return profile;
  }

  /**
   * Apply a partial update. If `address` is changed without explicit
   * `latitude` / `longitude`, the address is geocoded via Nominatim and
   * coords are filled in. Geocode failure is non-fatal — the profile
   * still saves without coords (matches the prior handler behaviour).
   */
  async applyUpdates(
    input: EmployerProfileUpdateInput,
    options?: { transaction?: Transaction },
  ): Promise<void> {
    const updates: Partial<EmployerProfile> = { ...input };

    if (
      input.address !== undefined &&
      input.address !== null &&
      input.latitude === undefined &&
      input.longitude === undefined
    ) {
      const geo = await geocodeIsraeliCity(String(input.address));
      if (geo) {
        updates.latitude = String(geo.latitude);
        updates.longitude = String(geo.longitude);
      }
    }

    if (Object.keys(updates).length) {
      await this.update(updates, options);
    }
  }

  /** Persist a freshly-uploaded logo URL. */
  async setLogoUrl(url: string): Promise<void> {
    await this.update({ logoUrl: url });
  }
}
