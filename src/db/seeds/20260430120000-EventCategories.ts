import { QueryInterface } from 'sequelize';

interface Category {
  name: string;
  slug: string;
  order: number;
}

const CATEGORIES: Category[] = [
  { name: 'חתונה', slug: 'wedding', order: 1 },
  { name: 'בר/בת מצווה', slug: 'bar-bat-mitzvah', order: 2 },
  { name: 'כנס', slug: 'conference', order: 3 },
  { name: 'אירוע חברה', slug: 'company-event', order: 4 },
  { name: 'תערוכה', slug: 'exhibition', order: 5 },
  { name: 'אירוע השקה', slug: 'launch-event', order: 6 },
  { name: 'יום הולדת', slug: 'birthday', order: 7 },
  { name: 'פסטיבל', slug: 'festival', order: 8 },
  { name: 'הופעה', slug: 'concert', order: 9 },
  { name: 'אירוע פרטי', slug: 'private-event', order: 10 },
  { name: 'אחר', slug: 'other', order: 11 },
];

const SLUGS = CATEGORIES.map((c) => c.slug);

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // Upsert by slug — keeps existing IDs (so already-attached events stay valid)
    for (const cat of CATEGORIES) {
      await queryInterface.sequelize.query(
        `INSERT INTO event_categories (name, slug, display_order, active, created_at, updated_at)
         VALUES (:name, :slug, :order, true, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             display_order = EXCLUDED.display_order,
             active = true,
             updated_at = NOW()`,
        { replacements: { name: cat.name, slug: cat.slug, order: cat.order } },
      );
    }

    // Delete old categories that are no longer in the canonical list AND
    // are not referenced by any event (to avoid breaking FKs).
    await queryInterface.sequelize.query(
      `DELETE FROM event_categories
       WHERE slug NOT IN (:keep)
         AND id NOT IN (
           SELECT DISTINCT event_category_id FROM events WHERE event_category_id IS NOT NULL
         )`,
      { replacements: { keep: SLUGS } },
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `DELETE FROM event_categories WHERE slug IN (:slugs)`,
      { replacements: { slugs: SLUGS } },
    );
  },
};
