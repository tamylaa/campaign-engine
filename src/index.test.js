import request from 'supertest';
import app from '../src/index.js';

describe('Campaign Engine API', () => {
  test('GET /health should return healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body.status).toBe('healthy');
    expect(response.body.service).toBe('campaign-engine');
  });

  test('GET / should return service information', async () => {
    const response = await request(app)
      .get('/')
      .expect(200);
    
    expect(response.body.service).toBe('Campaign Engine');
    expect(response.body.status).toBe('running');
    expect(response.body.endpoints).toBeDefined();
  });

  test('GET /health/db should return database status', async () => {
    const response = await request(app)
      .get('/health/db');
    
    // Should be either 200 (healthy) or 503 (unhealthy)
    expect([200, 503]).toContain(response.status);
    expect(response.body.status).toBeDefined();
  });
});
