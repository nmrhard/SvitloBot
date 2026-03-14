const { ContactList, DailyCheckSchedule } = require('../models');
const { invalidateCache } = require('../services/configService');

async function getContacts(request, reply) {
  try {
    const contacts = await ContactList.findAll({
      include: [
        {
          model: DailyCheckSchedule,
          as: 'schedules',
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return reply.send({ contacts });
  } catch (error) {
    request.log.error('Failed to fetch contacts:', error.message);
    return reply.status(500).send({ error: 'Failed to fetch contacts' });
  }
}

async function getContactById(request, reply) {
  const { id } = request.params;

  try {
    const contact = await ContactList.findByPk(id, {
      include: [
        {
          model: DailyCheckSchedule,
          as: 'schedules',
        },
      ],
    });

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    return reply.send({ contact });
  } catch (error) {
    request.log.error('Failed to fetch contact:', error.message);
    return reply.status(500).send({ error: 'Failed to fetch contact' });
  }
}

async function createContact(request, reply) {
  const {
    chatId,
    dailyGroupKey,
    dailyJsonUrl,
    dailyPngUrl,
    dailyThreadId,
    isActive,
    name,
    threadId,
  } = request.body;

  if (!chatId) {
    return reply.status(400).send({ error: 'chatId is required' });
  }

  try {
    const contact = await ContactList.create({
      chatId,
      dailyGroupKey,
      dailyJsonUrl,
      dailyPngUrl,
      dailyThreadId,
      isActive: isActive ?? true,
      name: name || 'default',
      threadId,
    });

    invalidateCache();
    return reply.status(201).send({ contact });
  } catch (error) {
    request.log.error('Failed to create contact:', error.message);
    return reply.status(500).send({ error: 'Failed to create contact' });
  }
}

async function updateContact(request, reply) {
  const { id } = request.params;
  const {
    chatId,
    dailyGroupKey,
    dailyJsonUrl,
    dailyPngUrl,
    dailyThreadId,
    isActive,
    name,
    threadId,
  } = request.body;

  try {
    const contact = await ContactList.findByPk(id);

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    await contact.update({
      chatId: chatId ?? contact.chatId,
      dailyGroupKey: dailyGroupKey ?? contact.dailyGroupKey,
      dailyJsonUrl: dailyJsonUrl ?? contact.dailyJsonUrl,
      dailyPngUrl: dailyPngUrl ?? contact.dailyPngUrl,
      dailyThreadId: dailyThreadId ?? contact.dailyThreadId,
      isActive: isActive ?? contact.isActive,
      name: name ?? contact.name,
      threadId: threadId ?? contact.threadId,
    });

    invalidateCache();
    return reply.send({ contact });
  } catch (error) {
    request.log.error('Failed to update contact:', error.message);
    return reply.status(500).send({ error: 'Failed to update contact' });
  }
}

async function deleteContact(request, reply) {
  const { id } = request.params;

  try {
    const contact = await ContactList.findByPk(id);

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    await contact.destroy();
    invalidateCache();
    return reply.status(204).send();
  } catch (error) {
    request.log.error('Failed to delete contact:', error.message);
    return reply.status(500).send({ error: 'Failed to delete contact' });
  }
}

async function getSchedules(request, reply) {
  const { contactId } = request.query;

  try {
    const where = {};
    if (contactId) {
      where.contactId = contactId;
    }

    const schedules = await DailyCheckSchedule.findAll({
      where,
      include: [
        {
          model: ContactList,
          as: 'contact',
          attributes: ['id', 'name', 'chatId'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return reply.send({ schedules });
  } catch (error) {
    request.log.error('Failed to fetch schedules:', error.message);
    return reply.status(500).send({ error: 'Failed to fetch schedules' });
  }
}

async function getScheduleById(request, reply) {
  const { id } = request.params;

  try {
    const schedule = await DailyCheckSchedule.findByPk(id, {
      include: [
        {
          model: ContactList,
          as: 'contact',
          attributes: ['id', 'name', 'chatId'],
        },
      ],
    });

    if (!schedule) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }

    return reply.send({ schedule });
  } catch (error) {
    request.log.error('Failed to fetch schedule:', error.message);
    return reply.status(500).send({ error: 'Failed to fetch schedule' });
  }
}

async function createSchedule(request, reply) {
  const { id: contactId } = request.params;
  const {
    endHour,
    endMinute,
    intervalMinutes,
    isActive,
    jsonMaxAgeHours,
    requireNonYesValues,
    sendTodayInitial,
    startHour,
    startMinute,
    timezone,
  } = request.body;

  try {
    const contact = await ContactList.findByPk(contactId);

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    const schedule = await DailyCheckSchedule.create({
      contactId,
      endHour: endHour ?? 23,
      endMinute: endMinute ?? 59,
      intervalMinutes: intervalMinutes ?? 30,
      isActive: isActive ?? true,
      jsonMaxAgeHours: jsonMaxAgeHours ?? 24,
      requireNonYesValues: requireNonYesValues ?? true,
      sendTodayInitial: sendTodayInitial ?? false,
      startHour: startHour ?? 20,
      startMinute: startMinute ?? 0,
      timezone: timezone || 'Europe/Kyiv',
    });

    invalidateCache();
    return reply.status(201).send({ schedule });
  } catch (error) {
    request.log.error('Failed to create schedule:', error.message);
    return reply.status(500).send({ error: 'Failed to create schedule' });
  }
}

async function updateSchedule(request, reply) {
  const { id } = request.params;
  const {
    endHour,
    endMinute,
    intervalMinutes,
    isActive,
    jsonMaxAgeHours,
    requireNonYesValues,
    sendTodayInitial,
    startHour,
    startMinute,
    timezone,
  } = request.body;

  try {
    const schedule = await DailyCheckSchedule.findByPk(id);

    if (!schedule) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }

    await schedule.update({
      endHour: endHour ?? schedule.endHour,
      endMinute: endMinute ?? schedule.endMinute,
      intervalMinutes: intervalMinutes ?? schedule.intervalMinutes,
      isActive: isActive ?? schedule.isActive,
      jsonMaxAgeHours: jsonMaxAgeHours ?? schedule.jsonMaxAgeHours,
      requireNonYesValues: requireNonYesValues ?? schedule.requireNonYesValues,
      sendTodayInitial: sendTodayInitial ?? schedule.sendTodayInitial,
      startHour: startHour ?? schedule.startHour,
      startMinute: startMinute ?? schedule.startMinute,
      timezone: timezone ?? schedule.timezone,
    });

    invalidateCache();
    return reply.send({ schedule });
  } catch (error) {
    request.log.error('Failed to update schedule:', error.message);
    return reply.status(500).send({ error: 'Failed to update schedule' });
  }
}

async function deleteSchedule(request, reply) {
  const { id } = request.params;

  try {
    const schedule = await DailyCheckSchedule.findByPk(id);

    if (!schedule) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }

    await schedule.destroy();
    invalidateCache();
    return reply.status(204).send();
  } catch (error) {
    request.log.error('Failed to delete schedule:', error.message);
    return reply.status(500).send({ error: 'Failed to delete schedule' });
  }
}

module.exports = {
  createContact,
  createSchedule,
  deleteContact,
  deleteSchedule,
  getContactById,
  getContacts,
  getScheduleById,
  getSchedules,
  updateContact,
  updateSchedule,
};
