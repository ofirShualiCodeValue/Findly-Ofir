import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Index,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'employer_profiles', timestamps: true, underscored: true })
export class EmployerProfile extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @Unique
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare userId: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare businessName: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare ownerName: string | null;

  @AllowNull(true)
  @Index
  @Column(DataType.STRING(20))
  declare vatNumber: string | null;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare contactEmail: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  declare contactPhone: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare address: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(2048))
  declare logoUrl: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user?: User;
}
