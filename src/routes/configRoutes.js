const {
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
} = require('../controllers/configController');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');

async function configRoutes(fastify) {
  fastify.addHook('preHandler', verifyFirebaseToken);

  fastify.get('/api/contacts', getContacts);
  fastify.get('/api/contacts/:id', getContactById);
  fastify.post('/api/contacts', createContact);
  fastify.put('/api/contacts/:id', updateContact);
  fastify.delete('/api/contacts/:id', deleteContact);

  fastify.get('/api/schedules', getSchedules);
  fastify.get('/api/schedules/:id', getScheduleById);
  fastify.post('/api/contacts/:id/schedules', createSchedule);
  fastify.put('/api/schedules/:id', updateSchedule);
  fastify.delete('/api/schedules/:id', deleteSchedule);
}

module.exports = configRoutes;
