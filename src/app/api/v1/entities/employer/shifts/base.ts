import { Includeable } from 'sequelize';
import { Request } from 'express';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { Shift } from '../../../../../models/Shift';
import { ShiftStaffingRequirement } from '../../../../../models/ShiftStaffingRequirement';
import { IndustrySubCategory } from '../../../../../models/IndustrySubCategory';

export class ShiftEntity extends Entity<Shift> {
  get id() {
    return this.instance.id;
  }
  get eventId() {
    return this.instance.eventId;
  }
  get startAt() {
    return this.instance.startAt;
  }
  get endAt() {
    return this.instance.endAt;
  }
  get contactPersonName() {
    return this.instance.contactPersonName;
  }
  get contactPersonPhone() {
    return this.instance.contactPersonPhone;
  }
  get notes() {
    return this.instance.notes;
  }
  get status() {
    return this.instance.status;
  }
  get staffingRequirements() {
    return (this.instance.staffingRequirements || []).map((r) => ({
      id: r.id,
      industry_subcategory_id: r.industrySubCategoryId,
      industry_subcategory: r.industrySubCategory
        ? {
            id: r.industrySubCategory.id,
            name: r.industrySubCategory.name,
            slug: r.industrySubCategory.slug,
          }
        : null,
      required_count: r.requiredCount,
    }));
  }
  get createdAt() {
    return this.instance.createdAt;
  }

  static includes(_context: Request): Includeable[] {
    return [
      {
        model: ShiftStaffingRequirement,
        include: [{ model: IndustrySubCategory }],
      },
    ];
  }
}
