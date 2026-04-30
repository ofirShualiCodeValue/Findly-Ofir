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
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User';

export enum PushPlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

@Table({ tableName: 'push_devices', timestamps: true, underscored: true })
export class PushDevice extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare userId: number;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(PushPlatform)))
  declare platform: PushPlatform;

  @Unique
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare token: string;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare enabled: boolean;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare lastSeenAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user?: User;
}
