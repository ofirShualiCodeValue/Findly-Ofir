import { Includeable } from 'sequelize';
import { Request } from 'express';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { Event } from '../../../../../models/Event';
import { EventCategory } from '../../../../../models/EventCategory';
import { ActivityArea } from '../../../../../models/ActivityArea';
import { User } from '../../../../../models/User';
import { EmployerProfile } from '../../../../../models/EmployerProfile';
import { IndustrySubCategory } from '../../../../../models/IndustrySubCategory';
import { Industry } from '../../../../../models/Industry';

export class EmployeeEventEntity extends Entity<Event> {
  get id() {
    return this.instance.id;
  }
  get name() {
    return this.instance.name;
  }
  get description() {
    return this.instance.description;
  }
  get venue() {
    return this.instance.venue;
  }
  get startAt() {
    return this.instance.startAt;
  }
  get endAt() {
    return this.instance.endAt;
  }
  get budget() {
    return this.instance.budget;
  }
  get requiredEmployees() {
    return this.instance.requiredEmployees;
  }
  get status() {
    return this.instance.status;
  }
  get latitude() {
    return this.instance.latitude;
  }
  get longitude() {
    return this.instance.longitude;
  }
  get eventCategory() {
    const cat = this.instance.eventCategory;
    if (!cat) return null;
    return { id: cat.id, name: cat.name, slug: cat.slug };
  }
  get activityArea() {
    const area = this.instance.activityArea;
    if (!area) return null;
    return { id: area.id, name: area.name, slug: area.slug };
  }
  get industrySubCategory() {
    const sc = this.instance.industrySubCategory;
    if (!sc) return null;
    return {
      id: sc.id,
      name: sc.name,
      slug: sc.slug,
      industry: sc.industry
        ? { id: sc.industry.id, name: sc.industry.name, slug: sc.industry.slug }
        : null,
    };
  }
  get employer() {
    const u = this.instance.creator;
    if (!u) return null;
    return {
      id: u.id,
      full_name: u.fullName,
      business_name: u.employerProfile?.businessName ?? null,
      logo_url: u.employerProfile?.logoUrl ?? null,
    };
  }

  static includes(_context: Request): Includeable[] {
    return [
      { model: EventCategory },
      { model: ActivityArea },
      {
        model: IndustrySubCategory,
        include: [{ model: Industry }],
      },
      {
        model: User,
        as: 'creator',
        attributes: ['id', 'fullName'],
        // latitude/longitude are loaded so the matcher can fall back to the
        // employer's business address when the event itself has no coords.
        include: [
          {
            model: EmployerProfile,
            attributes: ['businessName', 'logoUrl', 'latitude', 'longitude'],
          },
        ],
      },
    ];
  }
}
