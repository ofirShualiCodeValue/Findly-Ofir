import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Index,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User';
import { Event } from './Event';

export enum EventInterestStatus {
  INTERESTED = 'interested',
  NOT_INTERESTED = 'not_interested',
}

@Table({ tableName: 'event_interests', timestamps: true, underscored: true })
export class EventInterest extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare userId: number;

  @ForeignKey(() => Event)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare eventId: number;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(EventInterestStatus)))
  declare status: EventInterestStatus;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user?: User;

  @BelongsTo(() => Event)
  declare event?: Event;

  /**
   * Set or replace a worker's interest signal on an event. Used by the
   * "Interested / Not interested" buttons in the offers feed — repeat
   * calls flip the status atomically.
   */
  static async upsertFor(
    userId: number,
    eventId: number,
    status: EventInterestStatus,
  ): Promise<void> {
    const existing = await EventInterest.findOne({ where: { userId, eventId } });
    if (existing) {
      await existing.update({ status });
      return;
    }
    await EventInterest.create({ userId, eventId, status } as Partial<EventInterest>);
  }
}
