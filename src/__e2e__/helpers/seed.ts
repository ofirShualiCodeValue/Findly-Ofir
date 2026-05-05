// Seeds the canonical taxonomy (areas, categories, industries, sub-categories,
// certifications) by reusing the project's existing seeder files under
// `src/db/seeds/`. The seeders are idempotent (ON CONFLICT DO UPDATE) so they
// can be re-run safely.

/* eslint-disable @typescript-eslint/no-require-imports */
import { Sequelize } from 'sequelize';
import * as fs from 'fs';
import * as path from 'path';

interface Seeder {
  up: (queryInterface: ReturnType<Sequelize['getQueryInterface']>) => Promise<void>;
}

export async function seedTaxonomy(sequelize: Sequelize): Promise<void> {
  const dir = path.resolve(__dirname, '../../db/seeds');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
  const qi = sequelize.getQueryInterface();

  for (const f of files) {
    const seeder = require(path.join(dir, f)) as Seeder;
    if (typeof seeder.up !== 'function') {
      throw new Error(`Seeder ${f} has no up() export`);
    }
    await seeder.up(qi);
  }
}
