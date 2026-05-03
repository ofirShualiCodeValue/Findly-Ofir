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

  // Column is `industry_subcategory_id` (one word) — sequelize would
  // otherwise map the camelCase property to `industry_sub_category_id`.
  @ForeignKey(() => IndustrySubCategory)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, field: 'industry_subcategory_id' })
  declare industrySubCategoryId: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
