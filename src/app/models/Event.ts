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
import { User } from './User';
import { EventCategory } from './EventCategory';
import { ActivityArea } from './ActivityArea';
import { EventApplication } from './EventApplication';
import { Notification } from './Notification';
import { IndustrySubCategory } from './IndustrySubCategory';

export enum EventStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

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

  @ForeignKey(() => IndustrySubCategory)
  @AllowNull(true)
  @Index
  @Column(DataType.INTEGER)
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

  @HasMany(() => EventApplication)
  declare applications?: EventApplication[];

  @HasMany(() => Notification)
  declare notifications?: Notification[];
}
