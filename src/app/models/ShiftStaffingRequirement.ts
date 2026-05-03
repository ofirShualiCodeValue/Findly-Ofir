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
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Shift } from './Shift';
import { IndustrySubCategory } from './IndustrySubCategory';

@Table({ tableName: 'shift_staffing_requirements', timestamps: true, underscored: true })
export class ShiftStaffingRequirement extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Shift)
  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  declare shiftId: number;

  // Column is `industry_subcategory_id` (one word) — see UserIndustrySubCategory.
  @ForeignKey(() => IndustrySubCategory)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, field: 'industry_subcategory_id' })
  declare industrySubCategoryId: number;

  @AllowNull(false)
  @Default(1)
  @Column(DataType.INTEGER)
  declare requiredCount: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Shift)
  declare shift?: Shift;

  @BelongsTo(() => IndustrySubCategory)
  declare industrySubCategory?: IndustrySubCategory;
}
