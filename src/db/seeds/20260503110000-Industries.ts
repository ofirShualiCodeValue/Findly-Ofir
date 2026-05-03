import { QueryInterface } from 'sequelize';

interface SubCategory {
  name: string;
  slug: string;
}

interface Industry {
  name: string;
  slug: string;
  order: number;
  subs: SubCategory[];
}

/**
 * Canonical Industries (תחומים) and their Sub-Categories (תת-תחומים),
 * sourced from the Findly Figma. Sub-categories under "event-production"
 * are taken verbatim from the design; the rest are reasonable defaults
 * (5 each) and can be edited freely without code changes.
 */
const INDUSTRIES: Industry[] = [
  {
    name: 'עיצוב אירועים',
    slug: 'event-design',
    order: 1,
    subs: [
      { name: 'מעצב/ת אירועים', slug: 'event-designer' },
      { name: 'סטיילינג שולחנות', slug: 'table-styling' },
      { name: 'מעצב/ת תאורה דקורטיבית', slug: 'decorative-lighting-designer' },
      { name: 'אחראי/ת קישוטים', slug: 'decorations-lead' },
      { name: 'אחראי/ת קונספט', slug: 'concept-lead' },
    ],
  },
  {
    name: 'הפקת אירועים',
    slug: 'event-production',
    order: 2,
    subs: [
      { name: 'עובד הקמה', slug: 'setup-worker' },
      { name: 'עובד פירוק', slug: 'teardown-worker' },
      { name: 'סבל', slug: 'porter' },
      { name: 'שוזר פרחים', slug: 'florist' },
      { name: 'נהג רישיון ב\'', slug: 'driver-class-b' },
      { name: 'עוזר מפיק', slug: 'assistant-producer' },
      { name: 'מפיק טכני', slug: 'technical-producer' },
      { name: 'דייל רישום', slug: 'registration-agent' },
    ],
  },
  {
    name: 'בר לאירועים',
    slug: 'event-bar',
    order: 3,
    subs: [
      { name: 'ברמן/ית', slug: 'bartender' },
      { name: 'מלצר/ית', slug: 'waiter' },
      { name: 'מסייע/ת בר', slug: 'bar-assistant' },
      { name: 'סומלייה', slug: 'sommelier' },
      { name: 'אספקת בר', slug: 'bar-supplier' },
    ],
  },
  {
    name: 'קייטרינג',
    slug: 'catering',
    order: 4,
    subs: [
      { name: 'שף ראשי', slug: 'head-chef' },
      { name: 'סו-שף', slug: 'sous-chef' },
      { name: 'מלצר/ית', slug: 'waiter' },
      { name: 'אופה/קונדיטור/ית', slug: 'pastry-chef' },
      { name: 'אחראי/ת כיבוד', slug: 'refreshments-lead' },
    ],
  },
  {
    name: 'חברת ניקיון',
    slug: 'cleaning-company',
    order: 5,
    subs: [
      { name: 'עובד/ת ניקיון', slug: 'cleaner' },
      { name: 'עובד/ת שטיפה', slug: 'washer' },
      { name: 'אחראי/ת צוות ניקיון', slug: 'cleaning-team-lead' },
      { name: 'מנקה חלונות', slug: 'window-cleaner' },
      { name: 'ניקיון יבש', slug: 'dry-cleaning' },
    ],
  },
  {
    name: 'ספק השכרת ציוד',
    slug: 'equipment-rental',
    order: 6,
    subs: [
      { name: 'טכנאי/ת ציוד', slug: 'equipment-tech' },
      { name: 'נהג/ת משלוחים', slug: 'delivery-driver' },
      { name: 'מנהל/ת מחסן', slug: 'warehouse-manager' },
      { name: 'עובד/ת הרכבה', slug: 'assembly-worker' },
      { name: 'עוזר/ת משלוחים', slug: 'delivery-assistant' },
    ],
  },
  {
    name: 'חברת הגברה',
    slug: 'sound-company',
    order: 7,
    subs: [
      { name: 'מנהל/ת סאונד', slug: 'sound-manager' },
      { name: 'טכנאי/ת הגברה', slug: 'sound-tech' },
      { name: 'עובד/ת הקמת סאונד', slug: 'sound-setup' },
      { name: 'אחראי/ת במה', slug: 'stage-lead' },
      { name: 'מיקסר/ית', slug: 'mixer' },
    ],
  },
  {
    name: 'חברת תאורה',
    slug: 'lighting-company',
    order: 8,
    subs: [
      { name: 'טכנאי/ת תאורה', slug: 'lighting-tech' },
      { name: 'מעצב/ת תאורה', slug: 'lighting-designer' },
      { name: 'עובד/ת הקמת תאורה', slug: 'lighting-setup' },
      { name: 'מפעיל/ת לוח תאורה', slug: 'lighting-board-op' },
      { name: 'עובד/ת פירוק תאורה', slug: 'lighting-teardown' },
    ],
  },
  {
    name: 'צילום אירועים',
    slug: 'event-photography',
    order: 9,
    subs: [
      { name: 'צלם/ת ראשי/ת', slug: 'lead-photographer' },
      { name: 'צלם/ת עזר', slug: 'assistant-photographer' },
      { name: 'צלם/ת וידאו', slug: 'videographer' },
      { name: 'עורך/ת וידאו', slug: 'video-editor' },
      { name: 'צלם/ת רחפן', slug: 'drone-operator' },
    ],
  },
  {
    name: 'אולם אירועים וכנסים',
    slug: 'event-hall',
    order: 10,
    subs: [
      { name: 'מנהל/ת אולם', slug: 'hall-manager' },
      { name: 'מארח/ת אולם', slug: 'host' },
      { name: 'אחראי/ת קישוטים', slug: 'venue-decor-lead' },
      { name: 'מאבטח/ת', slug: 'security' },
      { name: 'מנהל/ת קייטרינג באולם', slug: 'in-hall-catering-manager' },
    ],
  },
  {
    name: 'אטרקציות לאירועים',
    slug: 'event-attractions',
    order: 11,
    subs: [
      { name: 'מפעיל/ת אטרקציות', slug: 'attraction-operator' },
      { name: 'ליצן/ית', slug: 'clown' },
      { name: 'מנחה/ת ופעיל/ה', slug: 'host-entertainer' },
      { name: 'אומן/ית במה', slug: 'stage-performer' },
      { name: 'מאפר/ת אירועים', slug: 'event-makeup-artist' },
    ],
  },
];

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    for (const ind of INDUSTRIES) {
      // Upsert industry by slug.
      await queryInterface.sequelize.query(
        `INSERT INTO industries (name, slug, display_order, active, created_at, updated_at)
         VALUES (:name, :slug, :order, true, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             display_order = EXCLUDED.display_order,
             active = true,
             updated_at = NOW()`,
        { replacements: { name: ind.name, slug: ind.slug, order: ind.order } },
      );

      // Read back the industry id.
      const [rows] = await queryInterface.sequelize.query(
        `SELECT id FROM industries WHERE slug = :slug LIMIT 1`,
        { replacements: { slug: ind.slug } },
      );
      const industryId = (rows as { id: number }[])[0]?.id;
      if (!industryId) continue;

      // Upsert sub-categories. Slug uniqueness is per (industry_id, slug).
      let order = 1;
      for (const sub of ind.subs) {
        await queryInterface.sequelize.query(
          `INSERT INTO industry_subcategories
             (industry_id, name, slug, display_order, active, created_at, updated_at)
           VALUES (:industryId, :name, :slug, :order, true, NOW(), NOW())
           ON CONFLICT (industry_id, slug) DO UPDATE
           SET name = EXCLUDED.name,
               display_order = EXCLUDED.display_order,
               active = true,
               updated_at = NOW()`,
          {
            replacements: {
              industryId,
              name: sub.name,
              slug: sub.slug,
              order: order++,
            },
          },
        );
      }
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const slugs = INDUSTRIES.map((i) => i.slug);
    await queryInterface.sequelize.query(
      `DELETE FROM industry_subcategories
       WHERE industry_id IN (SELECT id FROM industries WHERE slug IN (:slugs))`,
      { replacements: { slugs } },
    );
    await queryInterface.sequelize.query(`DELETE FROM industries WHERE slug IN (:slugs)`, {
      replacements: { slugs },
    });
  },
};
