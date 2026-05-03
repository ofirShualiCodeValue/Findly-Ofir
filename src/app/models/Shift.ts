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
import { Event } from './Event';
import { ShiftStaffingRequirement } from './ShiftStaffingRequirement';
import { EventApplication } from './EventApplication';

export enum ShiftStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
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
}
