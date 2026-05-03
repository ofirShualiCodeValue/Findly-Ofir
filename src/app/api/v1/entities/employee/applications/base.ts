import { Includeable } from 'sequelize';
import { Request } from 'express';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { EventApplication } from '../../../../../models/EventApplication';
import { Event } from '../../../../../models/Event';

export class EmployeeApplicationEntity extends Entity<EventApplication> {
  get id() {
    return this.instance.id;
  }
  get eventId() {
    return this.instance.eventId;
  }
  get status() {
    return this.instance.status;
  }
  get proposedAmount() {
    return this.instance.proposedAmount;
  }
  get note() {
    return this.instance.note;
  }
  get decidedAt() {
    return this.instance.decidedAt;
  }
  get reportedHours() {
    return this.instance.reportedHours;
  }
  get reportedAt() {
    return this.instance.reportedAt;
  }
  get hoursStatus() {
    return this.instance.hoursStatus;
  }
  get createdAt() {
    return this.instance.createdAt;
  }
  get event() {
    const e = this.instance.event;
    if (!e) return null;
    return {
      id: e.id,
      name: e.name,
      venue: e.venue,
      start_at: e.startAt,
      end_at: e.endAt,
      status: e.status,
    };
  }

  static includes(_context: Request): Includeable[] {
    return [{ model: Event, attributes: ['id', 'name', 'venue', 'startAt', 'endAt', 'status'] }];
  }
}
