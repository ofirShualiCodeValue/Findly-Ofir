import { Includeable } from 'sequelize';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { Request } from 'express';
import { User } from '../../../../../models/User';
import { EmployerProfile } from '../../../../../models/EmployerProfile';
import { ActivityArea } from '../../../../../models/ActivityArea';
import { EventCategory } from '../../../../../models/EventCategory';
import { Industry } from '../../../../../models/Industry';
import { IndustrySubCategory } from '../../../../../models/IndustrySubCategory';

class ActivityAreaEntity extends Entity<ActivityArea> {
  get id() {
    return this.instance.id;
  }
  get name() {
    return this.instance.name;
  }
  get slug() {
    return this.instance.slug;
  }
}

class EventCategoryEntity extends Entity<EventCategory> {
  get id() {
    return this.instance.id;
  }
  get name() {
    return this.instance.name;
  }
  get slug() {
    return this.instance.slug;
  }
}

class IndustryEntity extends Entity<Industry> {
  get id() {
    return this.instance.id;
  }
  get name() {
    return this.instance.name;
  }
  get slug() {
    return this.instance.slug;
  }
}

class IndustrySubCategoryEntity extends Entity<IndustrySubCategory> {
  get id() {
    return this.instance.id;
  }
  get industryId() {
    return this.instance.industryId;
  }
  get name() {
    return this.instance.name;
  }
  get slug() {
    return this.instance.slug;
  }
}

export class EmployerProfileFullEntity extends Entity<User> {
  get id() {
    return this.instance.id;
  }

  get fullName() {
    return this.instance.fullName;
  }

  get phone() {
    return this.instance.phone;
  }

  get email() {
    return this.instance.email;
  }

  get status() {
    return this.instance.status;
  }

  get notifications() {
    return {
      email: this.instance.notifyEmail,
      sms: this.instance.notifySms,
      push: this.instance.notifyPush,
    };
  }

  get business() {
    const profile = this.instance.employerProfile;
    if (!profile) return null;
    return {
      business_name: profile.businessName,
      owner_name: profile.ownerName,
      vat_number: profile.vatNumber,
      contact_email: profile.contactEmail,
      contact_phone: profile.contactPhone,
      address: profile.address,
      logo_url: profile.logoUrl,
      latitude: profile.latitude,
      longitude: profile.longitude,
      is_complete: this.isComplete,
    };
  }

  /**
   * True iff the employer has finished the post-signup completion flow:
   * business name + owner + vat + address filled, and at least one row
   * in each of activity_areas / event_categories / industries.
   */
  private get isComplete(): boolean {
    const p = this.instance.employerProfile;
    if (!p) return false;
    return Boolean(
      p.businessName &&
        p.ownerName &&
        p.vatNumber &&
        p.address &&
        (this.instance.activityAreas || []).length > 0 &&
        (this.instance.eventCategories || []).length > 0 &&
        (this.instance.industries || []).length > 0,
    );
  }

  get activityAreas() {
    return (this.instance.activityAreas || []).map(
      (area) => new ActivityAreaEntity(area, this.context),
    );
  }

  get eventCategories() {
    return (this.instance.eventCategories || []).map(
      (cat) => new EventCategoryEntity(cat, this.context),
    );
  }

  get industries() {
    return (this.instance.industries || []).map(
      (i) => new IndustryEntity(i, this.context),
    );
  }

  get industrySubCategories() {
    return (this.instance.industrySubCategories || []).map(
      (s) => new IndustrySubCategoryEntity(s, this.context),
    );
  }

  get createdAt() {
    return this.instance.createdAt;
  }

  static includes(_context: Request): Includeable[] {
    return [
      { model: EmployerProfile },
      { model: ActivityArea, through: { attributes: [] } },
      { model: EventCategory, through: { attributes: [] } },
      { model: Industry, through: { attributes: [] } },
      { model: IndustrySubCategory, through: { attributes: [] } },
    ];
  }
}
