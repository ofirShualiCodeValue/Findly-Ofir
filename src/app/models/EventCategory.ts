import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  Unique,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({ tableName: 'event_categories', timestamps: true, underscored: true })
export class EventCategory extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(50))
  declare slug: string;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare displayOrder: number;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare active: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
