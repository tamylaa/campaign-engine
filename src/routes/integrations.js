import express from 'express';

export function createIntegrationRoutes() {
  const router = express.Router();
  
  // Webhook endpoint for Cloudflare Workers integration
  router.post('/webhook', (req, res) => {
    try {
      // Validate webhook token
      const token = req.headers['x-service-token'];
      if (!token || token !== process.env.SERVICE_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized webhook request' });
      }
      
      // Process webhook payload
      const { type, data } = req.body;
      
      res.json({
        status: 'received',
        type,
        timestamp: new Date().toISOString(),
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Internal webhook processing error' });
    }
  });
  
  // Health check for integrations
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'integrations',
      endpoints: ['webhook'],
      timestamp: new Date().toISOString()
    });
  });
  
  return router;
}
