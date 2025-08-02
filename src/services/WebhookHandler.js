/**
 * Webhook Handler for Real-time Data Synchronization
 * Handles events from Cloudflare Workers (data-service) to trigger campaigns
 */

const DataServiceClient = require('./DataServiceClient');
const CampaignService = require('./CampaignService');
const logger = require('../utils/logger');

class WebhookHandler {
  constructor() {
    this.dataService = new DataServiceClient();
    this.campaignService = new CampaignService();
  }

  /**
   * Process incoming webhook events
   * @param {Object} event - Webhook event payload
   * @returns {Promise<Object>} Processing result
   */
  async processEvent(event) {
    const { type, data, timestamp, source } = event;

    try {
      logger.info(`Processing webhook event: ${type}`, { 
        eventId: event.id, 
        source, 
        timestamp 
      });

      switch (type) {
        case 'user_created':
          return await this.handleUserCreated(data);
          
        case 'user_profile_completed':
          return await this.handleProfileCompleted(data);
          
        case 'product_created':
          return await this.handleProductCreated(data);
          
        case 'product_updated':
          return await this.handleProductUpdated(data);
          
        case 'trade_initiated':
          return await this.handleTradeInitiated(data);
          
        case 'trade_completed':
          return await this.handleTradeCompleted(data);
          
        case 'user_login':
          return await this.handleUserLogin(data);
          
        case 'inventory_low':
          return await this.handleInventoryLow(data);
          
        default:
          logger.warn(`Unknown webhook event type: ${type}`);
          return { status: 'ignored', reason: 'Unknown event type' };
      }
    } catch (error) {
      logger.error(`Failed to process webhook event ${type}:`, error);
      throw error;
    }
  }

  /**
   * Handle new user registration
   */
  async handleUserCreated(userData) {
    const { userId, email, traderType, location, referralSource } = userData;

    // Start welcome email sequence
    const welcomeCampaign = await this.campaignService.createCampaign({
      name: `Welcome Sequence - ${email}`,
      type: 'email_sequence',
      targetAudience: [{ userId, email }],
      template: 'welcome_series',
      schedule: [
        { 
          delay: 0, 
          template: 'welcome_immediate',
          variables: { traderType, location }
        },
        { 
          delay: '2h', 
          template: 'getting_started_guide',
          variables: { traderType }
        },
        { 
          delay: '24h', 
          template: 'platform_tour' 
        },
        { 
          delay: '3d', 
          template: 'first_trade_encouragement',
          variables: { location }
        },
        { 
          delay: '7d', 
          template: 'community_introduction' 
        }
      ],
      metadata: {
        trigger: 'user_registration',
        referralSource,
        automatedSequence: true
      }
    });

    logger.info(`Welcome campaign created for user ${userId}`, {
      campaignId: welcomeCampaign.id,
      sequenceSteps: 5
    });

    return {
      status: 'processed',
      action: 'welcome_sequence_started',
      campaignId: welcomeCampaign.id
    };
  }

  /**
   * Handle user profile completion
   */
  async handleProfileCompleted(userData) {
    const { userId, completionLevel, interests, tradingGoals } = userData;

    if (completionLevel >= 80) {
      // Send profile completion congratulations
      await this.campaignService.createCampaign({
        name: `Profile Complete - ${userId}`,
        type: 'email',
        targetAudience: [{ userId }],
        template: 'profile_completion_congratulations',
        variables: {
          completionLevel,
          interests: interests.join(', '),
          tradingGoals
        }
      });

      // Start personalized product recommendations
      await this.schedulePersonalizedRecommendations(userId, interests);
    }

    return {
      status: 'processed',
      action: 'profile_completion_acknowledged',
      completionLevel
    };
  }

  /**
   * Handle new product creation
   */
  async handleProductCreated(productData) {
    const { productId, traderId, category, location, price, quantity } = productData;

    // Find users interested in this product category and location
    const interestedUsers = await this.dataService.getUsersForCampaign({
      filters: {
        interests: [category],
        location: location,
        notificationPreferences: { productAlerts: true }
      },
      limit: 500
    });

    if (interestedUsers.length > 0) {
      // Create product alert campaign
      const alertCampaign = await this.campaignService.createCampaign({
        name: `Product Alert - ${category} in ${location}`,
        type: 'email',
        targetAudience: interestedUsers,
        template: 'new_product_alert',
        variables: {
          productId,
          category,
          location,
          price,
          quantity,
          traderInfo: await this.dataService.getTraderProfile(traderId)
        },
        metadata: {
          trigger: 'product_created',
          productId,
          traderId
        }
      });

      // Also send SMS to high-priority users
      const highPriorityUsers = interestedUsers.filter(user => 
        user.preferences?.urgentAlerts === true
      );

      if (highPriorityUsers.length > 0) {
        await this.campaignService.createCampaign({
          name: `Urgent Product Alert SMS - ${category}`,
          type: 'sms',
          targetAudience: highPriorityUsers,
          template: 'urgent_product_alert_sms',
          variables: { category, location, price }
        });
      }

      return {
        status: 'processed',
        action: 'product_alert_sent',
        campaignId: alertCampaign.id,
        recipientCount: interestedUsers.length,
        urgentAlertCount: highPriorityUsers.length
      };
    }

    return {
      status: 'processed',
      action: 'no_interested_users',
      productId
    };
  }

  /**
   * Handle trade completion
   */
  async handleTradeCompleted(tradeData) {
    const { tradeId, buyerId, sellerId, productId, amount, feedback } = tradeData;

    // Send feedback request to buyer
    await this.campaignService.createCampaign({
      name: `Feedback Request - Trade ${tradeId}`,
      type: 'email',
      targetAudience: [{ userId: buyerId }],
      template: 'trade_feedback_request',
      variables: {
        tradeId,
        productId,
        amount,
        sellerInfo: await this.dataService.getTraderProfile(sellerId)
      },
      schedule: [{ delay: '2h', template: 'trade_feedback_request' }]
    });

    // Send thank you to seller
    await this.campaignService.createCampaign({
      name: `Sale Confirmation - Trade ${tradeId}`,
      type: 'email',
      targetAudience: [{ userId: sellerId }],
      template: 'sale_confirmation',
      variables: {
        tradeId,
        amount,
        buyerInfo: await this.dataService.getUserProfile(buyerId)
      }
    });

    // Suggest similar products to buyer
    await this.scheduleProductRecommendations(buyerId, productId);

    return {
      status: 'processed',
      action: 'post_trade_campaigns_created',
      tradeId
    };
  }

  /**
   * Handle inventory low alert
   */
  async handleInventoryLow(inventoryData) {
    const { traderId, productId, currentQuantity, threshold } = inventoryData;

    // Alert the trader
    await this.campaignService.createCampaign({
      name: `Low Inventory Alert - ${productId}`,
      type: 'email',
      targetAudience: [{ userId: traderId }],
      template: 'inventory_low_alert',
      variables: {
        productId,
        currentQuantity,
        threshold,
        restockSuggestions: await this.getRestockSuggestions(productId)
      }
    });

    return {
      status: 'processed',
      action: 'inventory_alert_sent',
      productId
    };
  }

  /**
   * Schedule personalized product recommendations
   * @private
   */
  async schedulePersonalizedRecommendations(userId, interests) {
    const recommendations = await this.dataService.getProductsForCampaign({
      category: interests,
      limit: 10,
      excludeUserId: userId
    });

    if (recommendations.length > 0) {
      await this.campaignService.createCampaign({
        name: `Personalized Recommendations - ${userId}`,
        type: 'email',
        targetAudience: [{ userId }],
        template: 'personalized_product_recommendations',
        variables: {
          recommendations: recommendations.slice(0, 5),
          interests: interests.join(', ')
        },
        schedule: [{ delay: '1h', template: 'personalized_product_recommendations' }]
      });
    }
  }

  /**
   * Schedule product recommendations based on purchase history
   * @private
   */
  async scheduleProductRecommendations(userId, purchasedProductId) {
    // Get user's trade history to find similar products
    const tradeHistory = await this.dataService.getRecentTradeActivity({
      userId,
      timeframe: '90d'
    });

    // Find products in similar categories
    const similarProducts = await this.dataService.getProductsForCampaign({
      category: tradeHistory.map(trade => trade.category),
      excludeProductId: purchasedProductId,
      limit: 8
    });

    if (similarProducts.length > 0) {
      await this.campaignService.createCampaign({
        name: `Similar Products - ${userId}`,
        type: 'email',
        targetAudience: [{ userId }],
        template: 'similar_product_recommendations',
        variables: {
          recentPurchase: purchasedProductId,
          recommendations: similarProducts.slice(0, 4)
        },
        schedule: [{ delay: '24h', template: 'similar_product_recommendations' }]
      });
    }
  }

  /**
   * Get restock suggestions for low inventory
   * @private
   */
  async getRestockSuggestions(productId) {
    // This would analyze market trends, seasonal patterns, etc.
    // For now, return basic suggestions
    return {
      suggestedQuantity: 100,
      seasonalTrend: 'increasing',
      competitorAnalysis: 'medium_competition'
    };
  }

  /**
   * Handle user login events for engagement tracking
   * @private
   */
  async handleUserLogin(loginData) {
    const { userId, loginTime, device, location } = loginData;

    // Update engagement tracking
    await this.dataService.updateUserEngagement(userId, 'system', {
      action: 'login',
      timestamp: loginTime,
      device,
      location
    });

    // Check if user has been inactive and send re-engagement
    const lastActivity = await this.getLastActivity(userId);
    if (lastActivity && this.daysSince(lastActivity) > 7) {
      await this.sendReEngagementCampaign(userId);
    }

    return {
      status: 'processed',
      action: 'login_tracked'
    };
  }

  /**
   * Send re-engagement campaign for inactive users
   * @private
   */
  async sendReEngagementCampaign(userId) {
    await this.campaignService.createCampaign({
      name: `Re-engagement - ${userId}`,
      type: 'email',
      targetAudience: [{ userId }],
      template: 'welcome_back',
      variables: {
        personalizedOffers: await this.getPersonalizedOffers(userId)
      }
    });
  }

  /**
   * Utility functions
   * @private
   */
  daysSince(date) {
    return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  }

  async getLastActivity(userId) {
    // Implementation would fetch from data service
    return null;
  }

  async getPersonalizedOffers(userId) {
    // Implementation would analyze user behavior and create offers
    return [];
  }
}

module.exports = WebhookHandler;
