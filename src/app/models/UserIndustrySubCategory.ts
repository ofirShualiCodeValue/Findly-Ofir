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
import { IndustrySubCategory } from './IndustrySubCategory';

@Table({ tableName: 'user_industry_subcategories', timestamps: true, underscored: true })
export class UserIndustrySubCategory extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare userId: number;

  @ForeignKey(() => IndustrySubCategory)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare industrySubCategoryId: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
