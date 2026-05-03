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
}
