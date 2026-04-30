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
import { EventCategory } from './EventCategory';

@Table({ tableName: 'employer_event_categories', timestamps: true, underscored: true })
export class EmployerEventCategory extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare userId: number;

  @ForeignKey(() => EventCategory)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare eventCategoryId: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
