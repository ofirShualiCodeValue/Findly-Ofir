import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  Index,
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Industry } from './Industry';
import { User } from './User';
import { UserIndustrySubCategory } from './UserIndustrySubCategory';

@Table({ tableName: 'industry_subcategories', timestamps: true, underscored: true })
export class IndustrySubCategory extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Industry)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare industryId: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare slug: string;

  @AllowNull(false)
  @Default(true)
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

  @BelongsTo(() => Industry)
  declare industry?: Industry;

  @BelongsToMany(() => User, () => UserIndustrySubCategory)
  declare users?: User[];
}
