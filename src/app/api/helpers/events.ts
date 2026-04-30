import { Request } from 'express';
import { Includeable } from 'sequelize';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Event } from '../../models/Event';

export async function loadOwnedEvent(
  req: Request,
  eventIdRaw: string | number,
  include?: Includeable[],
): Promise<Event> {
  const id = typeof eventIdRaw === 'string' ? parseInt(eventIdRaw, 10) : eventIdRaw;
  if (Number.isNaN(id)) {
    throw new APIError(400, 'Invalid event id');
  }

  const event = await Event.findOne({
    where: { id, createdByUserId: req.currentUser!.id },
    include,
  });

  if (!event) {
    throw new APIError(404, 'Event not found');
  }

  return event;
}
