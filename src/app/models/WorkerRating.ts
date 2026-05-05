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
import { EventApplication } from './EventApplication';

@Table({ tableName: 'worker_ratings', timestamps: true, underscored: true })
export class WorkerRating extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare workerUserId: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare ratedByUserId: number;

  @ForeignKey(() => EventApplication)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare eventApplicationId: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare rating: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare comment: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User, 'workerUserId')
  declare worker?: User;

  @BelongsTo(() => User, 'ratedByUserId')
  declare ratedBy?: User;

  @BelongsTo(() => EventApplication)
  declare application?: EventApplication;

  // =====================================================================
  // Domain logic — idempotent upsert + aggregate summary.
  // =====================================================================

  /**
   * Idempotently rate a worker on a single application: existing row →
   * update, otherwise create. Caller is responsible for any upstream
   * authorization (event ownership, application.assertRateable).
   */
  static async upsertFor(
    application: EventApplication,
    by: { ratedByUserId: number; rating: number; comment: string | null },
  ): Promise<void> {
    const existing = await WorkerRating.findOne({
      where: { eventApplicationId: application.id },
    });
    if (existing) {
      await existing.update({ rating: by.rating, comment: by.comment });
      return;
    }
    await WorkerRating.create({
      workerUserId: application.userId,
      ratedByUserId: by.ratedByUserId,
      eventApplicationId: application.id,
      rating: by.rating,
      comment: by.comment,
    } as Partial<WorkerRating>);
  }

  /**
   * Average rating (rounded to 2 decimals) + count, for one worker.
   * Returns avg=null when the worker has no ratings yet — caller decides
   * how to render that.
   */
  static async summaryFor(
    workerUserId: number,
  ): Promise<{ avg: number | null; count: number }> {
    const ratings = await WorkerRating.findAll({
      where: { workerUserId },
      attributes: ['rating'],
    });
    if (!ratings.length) return { avg: null, count: 0 };
    const sum = ratings.reduce((s, r) => s + r.rating, 0);
    return {
      avg: Math.round((sum / ratings.length) * 100) / 100,
      count: ratings.length,
    };
  }

  /**
   * Most recent ratings for one worker, with eager-loaded EventApplication
   * → Event for the rating-history card.
   */
  static async historyFor(workerUserId: number, limit = 20): Promise<WorkerRating[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventApplication } = require('./EventApplication');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Event } = require('./Event');
    return WorkerRating.findAll({
      where: { workerUserId },
      include: [
        {
          model: EventApplication,
          attributes: ['id', 'eventId'],
          include: [{ model: Event, attributes: ['id', 'name'] }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });
  }
}
