import { Includeable } from 'sequelize';
import { Request } from 'express';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { Event } from '../../../../../models/Event';
import { EventCategory } from '../../../../../models/EventCategory';
import { ActivityArea } from '../../../../../models/ActivityArea';

export class EventFullEntity extends Entity<Event> {
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

  get createdByUserId() {
    return this.instance.createdByUserId;
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

  get createdAt() {
    return this.instance.createdAt;
  }

  get updatedAt() {
    return this.instance.updatedAt;
  }

  static includes(_context: Request): Includeable[] {
    return [{ model: EventCategory }, { model: ActivityArea }];
  }
}
