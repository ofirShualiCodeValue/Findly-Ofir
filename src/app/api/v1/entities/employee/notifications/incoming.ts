import { Request } from 'express';
import { Includeable } from 'sequelize';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { Notification } from '../../../../../models/Notification';
import { Event } from '../../../../../models/Event';
import { User } from '../../../../../models/User';
import { EmployerProfile } from '../../../../../models/EmployerProfile';

/**
 * The employee's view of an inbound notification. The shape mirrors the
 * employer entity but also surfaces the sender (employer) so broadcast
 * messages can show "from {business_name}".
 */
export class EmployeeNotificationEntity extends Entity<Notification> {
  get id() {
    return this.instance.id;
  }
  get type() {
    return this.instance.type;
  }
  get title() {
    return this.instance.title;
  }
  get body() {
    return this.instance.body;
  }
  get meta() {
    return this.instance.meta;
  }
  get messageGroupId() {
    return this.instance.messageGroupId;
  }
  get readAt() {
    return this.instance.readAt;
  }
  get event() {
    const e = this.instance.event;
    if (!e) return null;
    return { id: e.id, name: e.name };
  }
  get sender() {
    const u = this.instance.sender;
    if (!u) return null;
    return {
      id: u.id,
      full_name: u.fullName,
      business_name: u.employerProfile?.businessName ?? null,
      logo_url: u.employerProfile?.logoUrl ?? null,
    };
  }
  get createdAt() {
    return this.instance.createdAt;
  }

  static includes(_context: Request): Includeable[] {
    return [
      { model: Event, attributes: ['id', 'name'] },
      {
        model: User,
        as: 'sender',
        attributes: ['id', 'fullName'],
        include: [{ model: EmployerProfile, attributes: ['businessName', 'logoUrl'] }],
      },
    ];
  }
}
