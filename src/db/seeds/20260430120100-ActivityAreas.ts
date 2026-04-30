import { QueryInterface } from 'sequelize';

interface Area {
  name: string;
  slug: string;
  order: number;
}

const AREAS: Area[] = [
  { name: 'מרכז', slug: 'center', order: 1 },
  { name: 'צפון', slug: 'north', order: 2 },
  { name: 'דרום', slug: 'south', order: 3 },
];

const SLUGS = AREAS.map((a) => a.slug);

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    for (const area of AREAS) {
      await queryInterface.sequelize.query(
        `INSERT INTO activity_areas (name, slug, display_order, active, created_at, updated_at)
         VALUES (:name, :slug, :order, true, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             display_order = EXCLUDED.display_order,
             active = true,
             updated_at = NOW()`,
        { replacements: { name: area.name, slug: area.slug, order: area.order } },
      );
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `DELETE FROM activity_areas WHERE slug IN (:slugs)`,
      { replacements: { slugs: SLUGS } },
    );
  },
};
