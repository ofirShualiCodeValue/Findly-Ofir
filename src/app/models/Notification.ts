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
import { fn, col } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Event } from './Event';
import { User } from './User';

interface BroadcastResult {
  message_group_id: string;
  recipient_count: number;
  sent_at: string;
}

interface BroadcastHistoryRow {
  message_group_id: string;
  title: string;
  body: string | null;
  sent_at: string;
  recipient_count: number;
}

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

  // =====================================================================
  // Domain logic — event broadcast + history aggregation.
  // =====================================================================

  /**
   * Send a single broadcast to every approved worker on the event.
   * All recipients share the same `messageGroupId` so the history can
   * collapse them into one row.
   */
  static async broadcastForEvent(
    eventId: number,
    senderUserId: number,
    title: string,
    body: string | null,
  ): Promise<BroadcastResult> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventApplication, EventApplicationStatus } = require('./EventApplication');
    const approved = await EventApplication.findAll({
      where: { eventId, status: EventApplicationStatus.APPROVED },
      attributes: ['userId'],
    });
    const recipientIds: number[] = approved.map((a: { userId: number }) => a.userId);
    if (!recipientIds.length) {
      throw new APIError(400, 'No approved employees to notify');
    }

    const messageGroupId = randomUUID();
    const sentAt = new Date();
    const rows = recipientIds.map((userId) => ({
      recipientUserId: userId,
      senderUserId,
      eventId,
      type: NotificationType.EVENT_MESSAGE,
      title,
      body,
      messageGroupId,
      meta: null,
      readAt: null,
      createdAt: sentAt,
      updatedAt: sentAt,
    }));
    await Notification.bulkCreate(rows as never);

    return {
      message_group_id: messageGroupId,
      recipient_count: recipientIds.length,
      sent_at: sentAt.toISOString(),
    };
  }

  /**
   * Aggregate history of broadcasts on one event — one row per
   * `messageGroupId`, newest first.
   */
  static async broadcastHistoryForEvent(eventId: number): Promise<BroadcastHistoryRow[]> {
    const groups = (await Notification.findAll({
      where: {
        eventId,
        type: NotificationType.EVENT_MESSAGE,
      },
      attributes: [
        [col('message_group_id'), 'message_group_id'],
        [col('title'), 'title'],
        [col('body'), 'body'],
        [fn('MIN', col('created_at')), 'sent_at'],
        [fn('COUNT', col('id')), 'recipient_count'],
      ],
      group: ['message_group_id', 'title', 'body'],
      order: [[fn('MIN', col('created_at')), 'DESC']],
      raw: true,
    })) as unknown as Array<BroadcastHistoryRow & { recipient_count: string }>;

    return groups.map((g) => ({
      message_group_id: g.message_group_id,
      title: g.title,
      body: g.body,
      sent_at: g.sent_at,
      recipient_count: parseInt(String(g.recipient_count), 10),
    }));
  }
}
