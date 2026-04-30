import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';

export interface TaxonomyLike {
  id: number;
  name: string;
  slug: string;
}

export class TaxonomyEntity extends Entity<TaxonomyLike> {
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
