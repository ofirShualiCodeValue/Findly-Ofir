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
  HasMany,
  BelongsToMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { IndustrySubCategory } from './IndustrySubCategory';
import { User } from './User';
import { UserIndustry } from './UserIndustry';

@Table({ tableName: 'industries', timestamps: true, underscored: true })
export class Industry extends Model {
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

  @HasMany(() => IndustrySubCategory)
  declare subCategories?: IndustrySubCategory[];

  @BelongsToMany(() => User, () => UserIndustry)
  declare users?: User[];
}
