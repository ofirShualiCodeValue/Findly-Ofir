import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { User } from '../../../../../models/User';

export class UserBaseEntity extends Entity<User> {
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

  get role() {
    return this.instance.role;
  }
}
