import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User';
import { ActivityArea } from './ActivityArea';

@Table({ tableName: 'employer_activity_areas', timestamps: true, underscored: true })
export class EmployerActivityArea extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare userId: number;

  @ForeignKey(() => ActivityArea)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare activityAreaId: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
