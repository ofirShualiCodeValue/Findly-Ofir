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
  @Column(DataType.STRING(20))
  declare phone: string;

  @AllowNull(true)
  @Index
  @Column(DataType.STRING)
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
}
