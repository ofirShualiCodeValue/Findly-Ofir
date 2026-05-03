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

export enum WorkStatus {
  FREELANCER = 'freelancer',
  SALARIED = 'salaried',
}

@Table({ tableName: 'employee_profiles', timestamps: true, underscored: true })
export class EmployeeProfile extends Model {
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

  @AllowNull(true)
  @Index
  @Column(DataType.STRING(9))
  declare idNumber: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  declare bankAccountNumber: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(10))
  declare bankBranch: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  declare bankName: string | null;

  @AllowNull(true)
  @Column(DataType.DATEONLY)
  declare dateOfBirth: string | null;

  @AllowNull(true)
  @Column(DataType.ENUM(...Object.values(WorkStatus)))
  declare workStatus: WorkStatus | null;

  @AllowNull(true)
  @Column(DataType.STRING(2048))
  declare avatarUrl: string | null;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  declare locationRangeKm: number | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(8, 2))
  declare baseHourlyRate: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare homeLatitude: string | null;

  @AllowNull(true)
  @Column(DataType.DECIMAL(9, 6))
  declare homeLongitude: string | null;

  @AllowNull(true)
  @Column(DataType.STRING)
  declare homeCity: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user?: User;
}
