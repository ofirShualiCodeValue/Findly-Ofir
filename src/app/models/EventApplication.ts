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
}
