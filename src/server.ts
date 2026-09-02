import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './modules/health/routes.js';
import { devAuthRoutes } from './modules/auth-dev.js';
import { companyRoutes } from './modules/companies/routes.js';
import { contactRoutes } from './modules/contacts/routes.js';
import { pipelineRoutes } from './modules/pipelines/routes.js';
import { opportunityRoutes } from './modules/opportunities/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { activityRoutes } from './modules/activities/routes.js';

const app=Fastify({logger:true});
await app.register(cors,{origin:config.CORS_ORIGIN});
await authPlugin(app);
await app.register(healthRoutes);
await app.register(devAuthRoutes,{prefix:'/auth'});
await app.register(companyRoutes,{prefix:'/companies'});
await app.register(contactRoutes,{prefix:'/contacts'});
await app.register(pipelineRoutes,{prefix:'/pipelines'});
await app.register(opportunityRoutes,{prefix:'/opportunities'});
await app.register(taskRoutes,{prefix:'/tasks'});
await app.register(activityRoutes,{prefix:'/activities'});

app.setErrorHandler((error,request,reply)=>{
  if(error instanceof ZodError)return reply.code(400).send({error:'ValidationError',details:error.flatten()});
  const status=(error as any).statusCode??500;
  if(status>=500)request.log.error(error);
  return reply.code(status).send({error:error.name||'Error',message:error.message});
});

await app.listen({port:config.PORT,host:'0.0.0.0'});
