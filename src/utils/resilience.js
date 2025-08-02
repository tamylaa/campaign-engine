/**
 * Circuit Breaker Implementation for MVP
 * Prevents cascade failures when services hit free tier limits
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
    this.fallback = options.fallback || (() => null);
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    
    // For monitoring
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalFallbacks: 0
    };
  }

  async fire(operation) {
    this.stats.totalRequests++;
    
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        // Circuit is open, use fallback
        this.stats.totalFallbacks++;
        return this.fallback();
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      if (this.shouldUseFallback(error)) {
        this.stats.totalFallbacks++;
        return this.fallback();
      }
      
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = 'CLOSED';
        console.log('Circuit breaker: State changed to CLOSED');
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.stats.totalFailures++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`Circuit breaker: State changed to OPEN after ${this.failureCount} failures`);
    }
  }

  shouldUseFallback(error) {
    // Use fallback for quota/rate limit errors
    const quotaErrors = [
      'quota exceeded',
      'rate limit',
      'too many requests',
      'service unavailable',
      'timeout'
    ];
    
    return quotaErrors.some(pattern => 
      error.message.toLowerCase().includes(pattern)
    );
  }

  getStats() {
    return {
      ...this.stats,
      state: this.state,
      failureCount: this.failureCount,
      successRate: this.stats.totalRequests > 0 
        ? ((this.stats.totalRequests - this.stats.totalFailures) / this.stats.totalRequests * 100).toFixed(2)
        : 100,
      fallbackRate: this.stats.totalRequests > 0
        ? (this.stats.totalFallbacks / this.stats.totalRequests * 100).toFixed(2)
        : 0
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }
}

/**
 * Rate Limiter for Free Tier Quota Management
 */
class FreeTierRateLimiter {
  constructor() {
    this.quotas = {
      d1Reads: { used: 0, limit: 90000, resetTime: this.getTomorrowMidnight() },
      d1Writes: { used: 0, limit: 90000, resetTime: this.getTomorrowMidnight() },
      workerRequests: { used: 0, limit: 90000, resetTime: this.getTomorrowMidnight() },
      railwayRequests: { used: 0, limit: 100000, resetTime: this.getTomorrowMidnight() }
    };
    
    this.alerts = {
      warningThreshold: 0.8, // 80%
      criticalThreshold: 0.95 // 95%
    };
  }

  async checkQuota(service) {
    this.resetQuotasIfNeeded();
    
    const quota = this.quotas[service];
    if (!quota) {
      throw new Error(`Unknown service: ${service}`);
    }

    const usagePercent = quota.used / quota.limit;
    
    if (usagePercent >= this.alerts.criticalThreshold) {
      throw new Error(`Critical quota usage for ${service}: ${(usagePercent * 100).toFixed(1)}%`);
    }
    
    if (usagePercent >= this.alerts.warningThreshold) {
      console.warn(`⚠️ High quota usage for ${service}: ${(usagePercent * 100).toFixed(1)}%`);
    }
    
    quota.used++;
    return true;
  }

  resetQuotasIfNeeded() {
    const now = Date.now();
    
    Object.keys(this.quotas).forEach(service => {
      if (now >= this.quotas[service].resetTime) {
        this.quotas[service].used = 0;
        this.quotas[service].resetTime = this.getTomorrowMidnight();
        console.log(`📊 Quota reset for ${service}`);
      }
    });
  }

  getTomorrowMidnight() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  getUsageStats() {
    this.resetQuotasIfNeeded();
    
    const stats = {};
    Object.keys(this.quotas).forEach(service => {
      const quota = this.quotas[service];
      stats[service] = {
        used: quota.used,
        limit: quota.limit,
        percentage: ((quota.used / quota.limit) * 100).toFixed(1),
        remaining: quota.limit - quota.used,
        resetIn: Math.max(0, quota.resetTime - Date.now())
      };
    });
    
    return stats;
  }
}

/**
 * Graceful Degradation Manager
 */
class GracefulDegradationManager {
  constructor() {
    this.degradationLevels = {
      NORMAL: 0,
      REDUCED: 1,
      MINIMAL: 2,
      EMERGENCY: 3
    };
    
    this.currentLevel = this.degradationLevels.NORMAL;
    this.cache = new Map();
  }

  setDegradationLevel(level, reason) {
    if (this.currentLevel !== level) {
      console.warn(`🔻 Degradation level changed to ${Object.keys(this.degradationLevels)[level]}: ${reason}`);
      this.currentLevel = level;
    }
  }

  async executeWithDegradation(operation, fallbackOptions = {}) {
    try {
      switch (this.currentLevel) {
        case this.degradationLevels.NORMAL:
          return await operation.full();
          
        case this.degradationLevels.REDUCED:
          return await operation.reduced?.() || operation.full();
          
        case this.degradationLevels.MINIMAL:
          return await operation.minimal?.() || this.getCachedResult(operation.cacheKey);
          
        case this.degradationLevels.EMERGENCY:
          return this.getCachedResult(operation.cacheKey) || fallbackOptions.emergency;
          
        default:
          return await operation.full();
      }
    } catch (error) {
      // Auto-escalate degradation on errors
      if (this.currentLevel < this.degradationLevels.EMERGENCY) {
        this.setDegradationLevel(this.currentLevel + 1, `Error: ${error.message}`);
        return this.executeWithDegradation(operation, fallbackOptions);
      }
      
      throw error;
    }
  }

  setCachedResult(key, data, ttl = 300000) { // 5 minutes default
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl
    });
  }

  getCachedResult(key) {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    
    this.cache.delete(key);
    return null;
  }

  getStatus() {
    return {
      level: Object.keys(this.degradationLevels)[this.currentLevel],
      cacheSize: this.cache.size,
      description: this.getDegradationDescription()
    };
  }

  getDegradationDescription() {
    switch (this.currentLevel) {
      case this.degradationLevels.NORMAL:
        return 'All features operating normally';
      case this.degradationLevels.REDUCED:
        return 'Some advanced features disabled to preserve core functionality';
      case this.degradationLevels.MINIMAL:
        return 'Only essential features available, using cached data where possible';
      case this.degradationLevels.EMERGENCY:
        return 'Emergency mode - cached responses only';
      default:
        return 'Unknown degradation level';
    }
  }
}

/**
 * Exponential Backoff Retry Utility
 */
async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryCondition = (error) => true
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !retryCondition(error)) {
        throw error;
      }
      
      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay;
      const totalDelay = delay + jitter;
      
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${totalDelay.toFixed(0)}ms: ${error.message}`);
      
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
  
  throw lastError;
}

module.exports = {
  CircuitBreaker,
  FreeTierRateLimiter,
  GracefulDegradationManager,
  retryWithBackoff
};
