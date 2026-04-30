import { Request } from 'express';
import { Includeable } from 'sequelize';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { Notification } from '../../../../../models/Notification';
import { Event } from '../../../../../models/Event';

export class IncomingNotificationEntity extends Entity<Notification> {
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

  get readAt() {
    return this.instance.readAt;
  }

  get event() {
    const e = this.instance.event;
    if (!e) return null;
    return { id: e.id, name: e.name };
  }

  get createdAt() {
    return this.instance.createdAt;
  }

  static includes(_context: Request): Includeable[] {
    return [{ model: Event, attributes: ['id', 'name'] }];
  }
}
