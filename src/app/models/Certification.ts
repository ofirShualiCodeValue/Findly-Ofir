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
  Index,
  BelongsToMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User';
import { UserCertification } from './UserCertification';

@Table({ tableName: 'certifications', timestamps: true, underscored: true })
export class Certification extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING)
  declare slug: string;

  @AllowNull(false)
  @Default(true)
  @Index
  @Column(DataType.BOOLEAN)
  declare active: boolean;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare displayOrder: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsToMany(() => User, () => UserCertification)
  declare users?: User[];
}
