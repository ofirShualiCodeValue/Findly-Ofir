import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';
import config from '../../../../../../config';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Findly Server API',
      version: '0.1.0',
      description:
        'Backend for the Findly platform ג€” employer and employee apps. ' +
        'Authentication is currently a dev-only X-User-Id header; will be replaced with JWT in phase 5.',
    },
    servers: [
      { url: `http://localhost:${config.port}`, description: 'Local development' },
    ],
    tags: [
      { name: 'Health', description: 'Liveness checks' },
      { name: 'Employer Profile', description: 'Business profile + service areas + event categories' },
      { name: 'Employer Events', description: 'Event lifecycle: create, list, update, cancel' },
      { name: 'Employer Taxonomies', description: 'Reference data: areas, event categories' },
      { name: 'Employer Applications', description: 'Approve/reject employees applying to events' },
      { name: 'Employer Event Notifications', description: 'Send messages to event employees' },
      { name: 'Employer Notifications', description: 'Inbox of notifications received by the employer' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'JWT obtained from POST /v1/shared/auth/sms/verify. ' +
            'Click the "Authorize" button at the top right and paste only the token value (without the word "Bearer").',
        },
      },
      schemas: {
        ApiSuccess: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 200 },
            message: { type: 'string', example: 'ok' },
            data: { description: 'Endpoint-specific payload' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 400 },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        Taxonomy: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
        EventStatus: {
          type: 'string',
          enum: ['draft', 'active', 'cancelled', 'completed'],
        },
        EventBase: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            venue: { type: 'string', nullable: true },
            start_at: { type: 'string', format: 'date-time' },
            end_at: { type: 'string', format: 'date-time' },
            budget: { type: 'string' },
            required_employees: { type: 'integer' },
            status: { $ref: '#/components/schemas/EventStatus' },
            event_category: { $ref: '#/components/schemas/Taxonomy' },
            activity_area: { $ref: '#/components/schemas/Taxonomy' },
          },
        },
        EventFull: {
          allOf: [
            { $ref: '#/components/schemas/EventBase' },
            {
              type: 'object',
              properties: {
                description: { type: 'string', nullable: true },
                created_by_user_id: { type: 'integer' },
                created_at: { type: 'string', format: 'date-time' },
                updated_at: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        CreateEventInput: {
          type: 'object',
          required: ['name', 'event_category_id', 'activity_area_id', 'start_at', 'end_at'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            venue: { type: 'string', nullable: true },
            event_category_id: { type: 'integer' },
            activity_area_id: { type: 'integer' },
            start_at: { type: 'string', format: 'date-time' },
            end_at: { type: 'string', format: 'date-time' },
            budget: { type: 'number', minimum: 0 },
            required_employees: { type: 'integer', minimum: 1 },
            status: { type: 'string', enum: ['draft', 'active'] },
          },
        },
        UpdateEventInput: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            venue: { type: 'string', nullable: true },
            event_category_id: { type: 'integer' },
            activity_area_id: { type: 'integer' },
            start_at: { type: 'string', format: 'date-time' },
            end_at: { type: 'string', format: 'date-time' },
            budget: { type: 'number', minimum: 0 },
            required_employees: { type: 'integer', minimum: 1 },
            status: { $ref: '#/components/schemas/EventStatus' },
          },
        },
        EmployerProfile: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            full_name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
            notifications: {
              type: 'object',
              properties: {
                email: { type: 'boolean' },
                sms: { type: 'boolean' },
                push: { type: 'boolean' },
              },
            },
            business: {
              type: 'object',
              nullable: true,
              properties: {
                business_name: { type: 'string' },
                owner_name: { type: 'string', nullable: true },
                vat_number: { type: 'string', nullable: true },
                contact_email: { type: 'string', nullable: true },
                contact_phone: { type: 'string', nullable: true },
                address: { type: 'string', nullable: true },
                logo_url: { type: 'string', nullable: true },
              },
            },
            activity_areas: { type: 'array', items: { $ref: '#/components/schemas/Taxonomy' } },
            event_categories: { type: 'array', items: { $ref: '#/components/schemas/Taxonomy' } },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        UpdateProfileInput: {
          type: 'object',
          properties: {
            full_name: { type: 'string' },
            email: { type: 'string', nullable: true },
            business_name: { type: 'string' },
            owner_name: { type: 'string', nullable: true },
            vat_number: { type: 'string', nullable: true },
            contact_email: { type: 'string', nullable: true },
            contact_phone: { type: 'string', nullable: true },
            address: { type: 'string', nullable: true },
            logo_url: { type: 'string', nullable: true },
            notifications: {
              type: 'object',
              properties: {
                email: { type: 'boolean' },
                sms: { type: 'boolean' },
                push: { type: 'boolean' },
              },
            },
          },
        },
        SyncIdsInput: {
          type: 'object',
          properties: {
            area_ids: { type: 'array', items: { type: 'integer' } },
            category_ids: { type: 'array', items: { type: 'integer' } },
          },
        },
        ApplicationStatus: {
          type: 'string',
          enum: [
            'pending',
            'approved',
            'rejected',
            'cancelled_by_employee',
            'cancelled_by_employer',
          ],
        },
        Application: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            event_id: { type: 'integer' },
            user_id: { type: 'integer' },
            status: { $ref: '#/components/schemas/ApplicationStatus' },
            decided_at: { type: 'string', format: 'date-time', nullable: true },
            proposed_amount: {
              type: 'string',
              nullable: true,
              description: "Total cost the applicant proposes for the event (decimal as string, e.g. '850.00')",
            },
            note: { type: 'string', nullable: true },
            applicant: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'integer' },
                full_name: { type: 'string' },
                phone: { type: 'string' },
                email: { type: 'string', nullable: true },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid auth header',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        Forbidden: {
          description: 'Authenticated but role does not match',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        NotFound: {
          description: 'Resource not found or not owned by current user',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
        ValidationError: {
          description: 'Request validation failed',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: [
    path.join(__dirname, '..', '..', 'handlers', '**', '*.ts'),
    path.join(__dirname, '..', '..', 'handlers', '**', '*.js'),
    path.join(__dirname, '..', '..', '..', '..', '..', 'app.ts'),
    path.join(__dirname, '..', '..', '..', '..', '..', 'app.js'),
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
