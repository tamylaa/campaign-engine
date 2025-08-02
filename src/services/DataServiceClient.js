/**
 * Data Service Client for Campaign Engine
 * Handles all communication with Cloudflare Workers data-service (D1 database)
 */

const { CircuitBreaker, FreeTierRateLimiter, GracefulDegradationManager, retryWithBackoff } = require('../utils/resilience');

class DataServiceClient {
  constructor() {
    this.baseURL = process.env.DATA_SERVICE_URL || 'https://your-data-service.workers.dev';
    this.apiKey = process.env.SERVICE_API_KEY;
    this.timeout = 30000; // 30 seconds
    
    // Add resilience components
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      fallback: () => this.getFallbackData()
    });
    
    this.rateLimiter = new FreeTierRateLimiter();
    this.degradationManager = new GracefulDegradationManager();
  }

  /**
   * Get users for campaign targeting with resilience
   * @param {Object} criteria - Filtering criteria
   * @returns {Promise<Array>} List of users matching criteria
   */
  async getUsersForCampaign(criteria) {
    return this.circuitBreaker.fire(() => 
      this.degradationManager.executeWithDegradation({
        cacheKey: `users-${JSON.stringify(criteria)}`,
        full: () => this.getUsersForCampaignFull(criteria),
        reduced: () => this.getUsersForCampaignReduced(criteria),
        minimal: () => this.getUsersForCampaignMinimal(criteria)
      }, {
        emergency: []
      })
    );
  }

  async getUsersForCampaignFull(criteria) {
    await this.rateLimiter.checkQuota('d1Reads');
    
    try {
      const response = await retryWithBackoff(() => 
        this.makeRequest('/api/users/query', {
          method: 'POST',
          body: JSON.stringify({
            filters: criteria.filters || {},
            location: criteria.location,
            traderType: criteria.traderType,
            interests: criteria.interests,
            limit: criteria.limit || 100,
            offset: criteria.offset || 0
          })
        }),
        {
          retryCondition: (error) => !error.message.includes('quota')
        }
      );

      const users = response.users || [];
      
      // Cache successful results
      this.degradationManager.setCachedResult(
        `users-${JSON.stringify(criteria)}`, 
        users, 
        300000 // 5 minutes
      );

      return users;
    } catch (error) {
      console.error('Failed to fetch users for campaign:', error);
      
      if (error.message.includes('quota') || error.message.includes('limit')) {
        this.degradationManager.setDegradationLevel(1, 'D1 quota limit approached');
      }
      
      throw new Error(`Campaign targeting failed: ${error.message}`);
    }
  }

  async getUsersForCampaignReduced(criteria) {
    // Reduced mode: smaller batch size, less complex filtering
    const reducedCriteria = {
      ...criteria,
      limit: Math.min(criteria.limit || 50, 50), // Max 50 users
      filters: {
        location: criteria.location // Only basic location filtering
      }
    };
    
    return this.getUsersForCampaignFull(reducedCriteria);
  }

  async getUsersForCampaignMinimal(criteria) {
    // Minimal mode: return cached data or very basic query
    const cached = this.degradationManager.getCachedResult(`users-${JSON.stringify(criteria)}`);
    if (cached) {
      return cached;
    }
    
    // Last resort: basic query with minimal criteria
    const minimalCriteria = {
      limit: 20,
      filters: { location: criteria.location }
    };
    
    return this.getUsersForCampaignFull(minimalCriteria);
  }

  getFallbackData() {
    return {
      users: [],
      fallback: true,
      message: 'Using fallback data due to service issues'
    };
  }

  /**
   * Get user profile data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User profile
   */
  async getUserProfile(userId) {
    try {
      const response = await this.makeRequest(`/api/users/${userId}`);
      return response.user;
    } catch (error) {
      console.error(`Failed to fetch user profile for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Update user engagement data
   * @param {string} userId - User ID
   * @param {string} campaignId - Campaign ID
   * @param {Object} engagement - Engagement data
   */
  async updateUserEngagement(userId, campaignId, engagement) {
    try {
      await this.makeRequest(`/api/users/${userId}/engagement`, {
        method: 'POST',
        body: JSON.stringify({
          campaignId,
          engagement,
          timestamp: new Date().toISOString(),
          source: 'campaign-engine'
        })
      });
    } catch (error) {
      console.error(`Failed to update engagement for user ${userId}:`, error);
      // Non-critical operation, don't throw
    }
  }

  /**
   * Get products for campaign content
   * @param {Object} criteria - Product filtering criteria
   * @returns {Promise<Array>} List of products
   */
  async getProductsForCampaign(criteria) {
    try {
      const response = await this.makeRequest('/api/products/query', {
        method: 'POST',
        body: JSON.stringify({
          category: criteria.category,
          location: criteria.location,
          traderId: criteria.traderId,
          availability: criteria.availability || 'available',
          limit: criteria.limit || 50
        })
      });

      return response.products || [];
    } catch (error) {
      console.error('Failed to fetch products for campaign:', error);
      return [];
    }
  }

  /**
   * Get trader profile for campaign personalization
   * @param {string} traderId - Trader ID
   * @returns {Promise<Object>} Trader profile
   */
  async getTraderProfile(traderId) {
    try {
      const response = await this.makeRequest(`/api/traders/${traderId}`);
      return response.trader;
    } catch (error) {
      console.error(`Failed to fetch trader profile for ${traderId}:`, error);
      return null;
    }
  }

  /**
   * Get recent trade activity for targeting
   * @param {Object} criteria - Trade activity criteria
   * @returns {Promise<Array>} Recent trades
   */
  async getRecentTradeActivity(criteria) {
    try {
      const response = await this.makeRequest('/api/trades/recent', {
        method: 'POST',
        body: JSON.stringify({
          userId: criteria.userId,
          category: criteria.category,
          timeframe: criteria.timeframe || '30d',
          limit: criteria.limit || 20
        })
      });

      return response.trades || [];
    } catch (error) {
      console.error('Failed to fetch trade activity:', error);
      return [];
    }
  }

  /**
   * Batch operation: Get multiple users efficiently
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Array>} Array of user profiles
   */
  async getUsersBatch(userIds) {
    try {
      const response = await this.makeRequest('/api/users/batch', {
        method: 'POST',
        body: JSON.stringify({ userIds })
      });

      return response.users || [];
    } catch (error) {
      console.error('Failed to fetch users batch:', error);
      return [];
    }
  }

  /**
   * Get user preferences for campaign targeting
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User preferences
   */
  async getUserPreferences(userId) {
    try {
      const response = await this.makeRequest(`/api/users/${userId}/preferences`);
      return response.preferences || {};
    } catch (error) {
      console.error(`Failed to fetch preferences for user ${userId}:`, error);
      return {};
    }
  }

  /**
   * Update campaign performance metrics back to D1
   * @param {string} campaignId - Campaign ID
   * @param {Object} metrics - Performance metrics
   */
  async updateCampaignMetrics(campaignId, metrics) {
    try {
      await this.makeRequest('/api/campaigns/metrics', {
        method: 'POST',
        body: JSON.stringify({
          campaignId,
          metrics,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error(`Failed to update campaign metrics for ${campaignId}:`, error);
      // Non-critical, continue execution
    }
  }

  /**
   * Generic HTTP request method with error handling
   * @private
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'CampaignEngine/1.0'
      },
      timeout: this.timeout
    };

    const requestOptions = { ...defaultOptions, ...options };
    
    // Merge headers properly
    if (options.headers) {
      requestOptions.headers = { ...defaultOptions.headers, ...options.headers };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return { success: true };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Health check for data service connectivity
   * @returns {Promise<boolean>} Service health status
   */
  async healthCheck() {
    try {
      await this.makeRequest('/health');
      return true;
    } catch (error) {
      console.error('Data service health check failed:', error);
      return false;
    }
  }
}

module.exports = DataServiceClient;
