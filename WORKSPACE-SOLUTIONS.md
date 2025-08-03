# NPM Workspace Solutions

## Problem
When a project is part of an npm workspace (defined in parent directory's package.json), npm commands executed from subdirectories may not work as expected because npm treats the workspace root as the primary package.

## Root Cause
The parent `tamyla` directory has a `package.json` with workspaces configuration:
```json
{
  "workspaces": [
    "trading-portal",
    "auth-service", 
    "data-service",
    "engagekit",
    "campaign-engine"
  ]
}
```

This causes npm to anchor commands to the workspace root instead of the local directory.

## Solutions

### ✅ Solution 1: Workspace commands from root (RECOMMENDED)
From the workspace root (`tamyla/`):
```bash
npm run start --workspace=campaign-engine
npm run dev --workspace=campaign-engine
npm run migrate --workspace=campaign-engine
npm run test --workspace=campaign-engine
```

### ✅ Solution 2: Direct node execution for development
From the project directory (`campaign-engine/`):
```bash
node src/index.js
nodemon src/index.js
node scripts/migrate-new.js
```

### ✅ Solution 3: Use yarn (alternative)
Yarn handles workspaces more predictably:
```bash
yarn workspace campaign-engine start
yarn workspace campaign-engine dev
```

### ❌ What Doesn't Work
Local npm commands from subdirectory (due to workspace anchoring):
```bash
npm start          # ❌ Uses workspace root package.json
npm run start      # ❌ Uses workspace root package.json
```

## Package.json Configuration
Ensure scripts use relative paths:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "migrate": "node scripts/migrate-new.js"
  }
}
```

## VS Code Integration
For VS Code tasks, use workspace-aware commands:
```json
{
  "tasks": [
    {
      "label": "Start Campaign Engine",
      "type": "shell",
      "command": "npm",
      "args": ["run", "start", "--workspace=campaign-engine"],
      "group": "build",
      "isBackground": true
    }
  ]
}
```

## Environment Loading
Ensure `.env` files are loaded correctly with relative paths:
```javascript
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the correct directory
dotenv.config({ path: path.join(process.cwd(), '.env') });
```

## Best Practices
1. **Always use workspace commands** in CI/CD and scripts
2. **Use relative paths** in package.json scripts  
3. **Document workspace structure** for team members
4. **Test commands from different directories** to ensure they work
5. **Use environment variable validation** to catch path issues early

## Testing the Solution
```bash
# From tamyla directory
npm run start --workspace=campaign-engine

# From campaign-engine directory  
npm run start --workspace=campaign-engine

# Both should work identically
```
