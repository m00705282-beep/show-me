/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the 100 requests in 15 minutes limit!',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    console.log('[rate-limit] ⚠️  Rate limit exceeded:', req.ip, req.method, req.path);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'You have exceeded the 100 requests in 15 minutes limit!',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Strict rate limiter for critical endpoints (restart, etc.)
 * 5 requests per 15 minutes
 */
export const criticalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Critical endpoint: You have exceeded the 5 requests in 15 minutes limit!',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log('[rate-limit] 🚨 CRITICAL rate limit exceeded:', req.ip, req.method, req.path);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Critical endpoint: Maximum 5 requests per 15 minutes!',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Lenient rate limiter for public endpoints (snapshot, etc.)
 * 300 requests per 15 minutes
 */
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the 300 requests in 15 minutes limit!',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env.NODE_ENV !== 'production' && req.ip === '::1') {
      return true;
    }
    return false;
  }
});

export default {
  apiLimiter,
  criticalLimiter,
  publicLimiter
};
