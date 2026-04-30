import { Includeable } from 'sequelize';
import { Request } from 'express';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { EventApplication } from '../../../../../models/EventApplication';
import { User } from '../../../../../models/User';

export class ApplicationBaseEntity extends Entity<EventApplication> {
  get id() {
    return this.instance.id;
  }

  get eventId() {
    return this.instance.eventId;
  }

  get userId() {
    return this.instance.userId;
  }

  get status() {
    return this.instance.status;
  }

  get decidedAt() {
    return this.instance.decidedAt;
  }

  get note() {
    return this.instance.note;
  }

  get proposedAmount() {
    return this.instance.proposedAmount;
  }

  get applicant() {
    const u = this.instance.applicant;
    if (!u) return null;
    return {
      id: u.id,
      full_name: u.fullName,
      phone: u.phone,
      email: u.email,
    };
  }

  get createdAt() {
    return this.instance.createdAt;
  }

  static includes(_context: Request): Includeable[] {
    return [{ model: User, as: 'applicant' }];
  }
}
