# Railway + GitHub Setup Guide: Campaign Engine

## 🎯 **Project Setup Complete!**

### **Railway Project Details**
- **Project Name**: campaign-engine  
- **Project ID**: ae1a2002-ed07-43ce-8f15-e005a33f9943
- **Dashboard**: https://railway.com/project/ae1a2002-ed07-43ce-8f15-e005a33f9943

### **Services Provisioned**
✅ **PostgreSQL Database** - Ready for campaign data, analytics, logs
✅ **Redis Cache** - Ready for queue management and caching

## 🔗 **Database Connection Details**

### **PostgreSQL (Use DATABASE_URL)**
```bash
# Internal Railway connection (for deployed app)
DATABASE_URL=postgresql://postgres:zDVRkRySjEwsCiVcADKVWUrFITNKKVcm@postgres.railway.internal:5432/railway

# Public connection (for local development)
DATABASE_PUBLIC_URL=postgresql://postgres:zDVRkRySjEwsCiVcADKVWUrFITNKKVcm@interchange.proxy.rlwy.net:13941/railway
```

### **Redis Connection** (Next step)
Need to link to Redis service to get connection string

## 🚀 **Next Steps for GitHub Integration**

### **1. Create GitHub Repository for Campaign Engine**
```bash
# Navigate to campaign-engine directory (already done)
cd campaign-engine

# Initialize git if not already done
git init

# Add all files
git add .

# Initial commit
git commit -m "Initial campaign-engine setup with Railway integration"

# Add GitHub remote (replace with your actual repo)
git remote add origin https://github.com/tamylaa/campaign-engine.git

# Push to GitHub
git push -u origin main
```

### **2. Connect Railway to GitHub**
```bash
# Option 1: Via Railway CLI (connect existing GitHub repo)
npx @railway/cli link --repo tamylaa/campaign-engine

# Option 2: Via Railway Dashboard
# 1. Go to https://railway.com/project/ae1a2002-ed07-43ce-8f15-e005a33f9943
# 2. Click "Connect Repo" 
# 3. Select GitHub and authorize
# 4. Choose tamylaa/campaign-engine repository
# 5. Enable auto-deploy on main branch
```

### **3. Add Redis Connection Details**
```bash
# Link to Redis service
npx @railway/cli service
# Select "Redis"

# Get Redis variables
npx @railway/cli variables
# Copy REDIS_URL for environment configuration
```

### **4. Environment Configuration**

Update `campaign-engine/.env.example`:
```bash
# Database
DATABASE_URL=postgresql://postgres:password@postgres.railway.internal:5432/railway
DATABASE_PUBLIC_URL=postgresql://postgres:password@interchange.proxy.rlwy.net:port/railway

# Redis
REDIS_URL=redis://default:password@redis.railway.internal:6379

# Service Integration
DATA_SERVICE_URL=https://data-service.tamylatrading.workers.dev
AUTO_EMAIL_SERVICE_URL=https://auto_email.tamyla.com
SERVICE_API_KEY=your_service_token_here

# Railway Config
NODE_ENV=production
PORT=3000
```

## 🔧 **Railway Configuration Files**

### **Already Created**
✅ `railway.toml` - Railway deployment configuration
✅ `package.json` - Updated with Railway-optimized scripts
✅ `Dockerfile` - Optional containerization
✅ `.gitignore` - Proper exclusions
✅ GitHub Actions workflow in `.github/workflows/deploy.yml`

### **Database Migration Setup**
✅ `scripts/migrate.js` - Database migration script
✅ Migration runs automatically on deployment

## 📊 **Deployment Process**

### **Automatic Deployment (GitHub → Railway)**
1. Push code to GitHub main branch
2. Railway automatically detects changes
3. Builds and deploys with migrations
4. Health checks validate deployment

### **Manual Deployment**
```bash
# Deploy directly from local
npx @railway/cli up

# Deploy with specific service
npx @railway/cli deploy --service campaign-engine
```

## 🔍 **Monitoring & Management**

### **Railway Dashboard Features**
- **Logs**: Real-time application and deployment logs
- **Metrics**: CPU, memory, network usage
- **Variables**: Environment variable management  
- **Deployments**: Deployment history and rollback
- **Domains**: Custom domain configuration

### **CLI Management**
```bash
# View logs
npx @railway/cli logs

# Check service status  
npx @railway/cli status

# Open project dashboard
npx @railway/cli open

# Run commands with Railway environment
npx @railway/cli run npm test
```

## 🚨 **Important Notes**

### **Free Tier Limitations** (As discussed in our architecture)
- **Memory**: 512MB RAM shared between app services
- **Sleep**: Services sleep after 30 minutes of inactivity  
- **CPU**: Shared CPU resources
- **Storage**: 1GB disk storage

### **Security Considerations**
- Database credentials are auto-generated and secure
- Internal Railway networking for service-to-service communication
- Environment variables managed securely in Railway dashboard

### **Cost Management**
- Free tier sufficient for MVP development
- Usage monitoring in Railway dashboard
- Easy upgrade to paid plans when needed

## 🎯 **Integration with Existing Architecture**

### **Service Communication Pattern**
```
GitHub → Railway → Campaign Engine → PostgreSQL/Redis
   ↕                     ↕
Cloudflare Workers ←→ API Integration
(auth-service, data-service, auto-email)
```

### **Data Flow** (As per our architecture decisions)
1. **Webhook triggers** from Cloudflare Workers (data-service)
2. **Campaign processing** in Railway (campaign-engine)  
3. **User data queries** via API to Cloudflare Workers (D1)
4. **Campaign results** stored in Railway (PostgreSQL)
5. **Engagement updates** sent back to Cloudflare Workers (D1)

## ✅ **Verification Steps**

### **Test Database Connection**
```bash
# Test PostgreSQL connection
npx @railway/cli run node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()', (err, res) => {
  console.log(err ? err : 'PostgreSQL connected:', res.rows[0]);
  pool.end();
});
"
```

### **Test Deployment**
```bash
# Simple test deployment
echo "console.log('Railway deployment test');" > test.js
npx @railway/cli run node test.js
```

## 🔄 **Next Actions**

1. **Get Redis connection details** (link to Redis service)
2. **Create GitHub repository** for campaign-engine  
3. **Connect Railway to GitHub** for auto-deployment
4. **Test full deployment pipeline**
5. **Verify integration** with existing Cloudflare Workers

This setup gives you a **production-ready** campaign engine with **automatic scaling**, **managed databases**, and **seamless GitHub integration** - all optimized for your African trading network vision! 🚀
