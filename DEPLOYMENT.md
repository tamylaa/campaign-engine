# Campaign Engine Deployment Guide

## 🚀 Railway Deployment

### 1. Set up Railway Project
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Link to existing project (if you have one)
railway link
```

### 2. Environment Variables Setup
Copy these variables to Railway dashboard or use CLI:

```bash
# Essential variables
railway variables set SERVICE_TOKEN=your-secure-token
railway variables set JWT_SECRET=your-jwt-secret-from-cf-workers
railway variables set AUTH_SERVICE_URL=https://auth.tamyla.com
railway variables set AUTO_EMAIL_API_KEY=your-auto-email-key

# Database (Railway will auto-provide DATABASE_URL when you add PostgreSQL)
railway add postgresql

# Redis (Railway will auto-provide REDIS_URL when you add Redis)
railway add redis
```

### 3. Deploy
```bash
# Deploy to Railway
railway up

# Your service will be available at:
# https://campaign-engine-production.up.railway.app
```

## 🔗 Integration with Cloudflare Workers

### 1. Update Your Cloudflare Workers
Add Railway URL as environment variable:

```bash
# In your Cloudflare Worker
wrangler secret put CAMPAIGN_ENGINE_URL
# Value: https://campaign-engine-production.up.railway.app
```

### 2. Call Campaign Engine from CF Worker
```javascript
// In your auth-service or data-service
export default {
  async fetch(request, env) {
    // Start email campaign
    const campaign = await fetch(`${env.CAMPAIGN_ENGINE_URL}/api/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': env.SERVICE_TOKEN
      },
      body: JSON.stringify({
        type: 'trader-welcome',
        targetAudience: [{ email: 'trader@example.com', name: 'John Doe' }],
        tradeNetworkData: { newProducts: 5, featuredCategory: 'Coffee' }
      })
    });

    return new Response(JSON.stringify({ campaignStarted: true }));
  }
};
```

## 🔧 Integration Testing

### Test Cloudflare ↔ Railway Connection
```bash
# Test from your machine
curl https://campaign-engine-production.up.railway.app/test/cloudflare-integration

# Expected response:
{
  "integration": "cloudflare-workers",
  "results": {
    "auth": { "status": "connected", "statusCode": 200 },
    "data": { "status": "connected", "statusCode": 200 },
    "auto-email": { "status": "connected", "statusCode": 200 }
  }
}
```

## 📊 Monitoring Integration Health

### 1. Add Health Checks to CF Workers
```javascript
// Add to your Cloudflare Workers
app.get('/health', () => {
  return new Response(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'auth-service' // or data-service, auto-email
  }));
});
```

### 2. Monitor from Railway
The campaign engine automatically checks CF Worker health at `/test/cloudflare-integration`

## 🚨 Common Integration Issues & Solutions

### Issue 1: CORS Errors
**Symptom**: `Access-Control-Allow-Origin` errors
**Solution**: Already configured in campaign engine CORS setup

### Issue 2: Authentication Failures  
**Symptom**: 401 errors between services
**Solution**: Ensure `SERVICE_TOKEN` and `JWT_SECRET` match across all services

### Issue 3: Timeout Issues
**Symptom**: CF Worker times out calling Railway
**Solution**: Use async patterns, don't wait for completion:

```javascript
// ✅ Good - Fire and forget
fetch('https://railway.app/api/campaigns', { method: 'POST', body: data });
return new Response(JSON.stringify({ started: true }));

// ❌ Bad - Waiting for completion
const result = await fetch('https://railway.app/api/campaigns');
await result.json(); // Might timeout
```

## 💡 Next Steps

1. **Deploy campaign engine to Railway**
2. **Update CF Workers with Railway URL**
3. **Test integration with sample campaign**
4. **Monitor health endpoints**
5. **Add real email templates and trade network data**

## 💰 Cost Estimate

- **Railway**: $5-20/month (depends on usage)
- **Redis addon**: $10/month (for background jobs)
- **PostgreSQL**: $10/month (for campaign data)
- **Total**: $25-40/month

Much cheaper than complex multi-tenant architecture and gives you powerful campaign capabilities!
