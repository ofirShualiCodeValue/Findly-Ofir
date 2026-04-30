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

export enum NotificationType {
  EVENT_MESSAGE = 'event_message',
  APPLICATION_APPROVED = 'application_approved',
  APPLICATION_REJECTED = 'application_rejected',
  SHIFT_REMINDER = 'shift_reminder',
  SHIFT_ENDED = 'shift_ended',
  EMPLOYEE_CANCELLED = 'employee_cancelled',
  EVENT_CANCELLED = 'event_cancelled',
  SYSTEM = 'system',
}

@Table({ tableName: 'notifications', timestamps: true, underscored: true })
export class Notification extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare recipientUserId: number;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  declare senderUserId: number | null;

  @ForeignKey(() => Event)
  @AllowNull(true)
  @Index
  @Column(DataType.INTEGER)
  declare eventId: number | null;

  @AllowNull(false)
  @Index
  @Column(DataType.ENUM(...Object.values(NotificationType)))
  declare type: NotificationType;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare title: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare body: string | null;

  @AllowNull(true)
  @Index
  @Column(DataType.UUID)
  declare messageGroupId: string | null;

  @AllowNull(true)
  @Column(DataType.JSONB)
  declare meta: Record<string, unknown> | null;

  @AllowNull(true)
  @Index
  @Column(DataType.DATE)
  declare readAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User, 'recipientUserId')
  declare recipient?: User;

  @BelongsTo(() => User, 'senderUserId')
  declare sender?: User;

  @BelongsTo(() => Event)
  declare event?: Event;
}
