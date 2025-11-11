/**
 * Authentication Middleware
 * Protects sensitive API endpoints with API key authentication
 */

import crypto from 'crypto';

// Generate random API key if not set
const DEFAULT_API_KEY = process.env.API_KEY || crypto.randomBytes(32).toString('hex');

if (!process.env.API_KEY) {
  console.log('⚠️  [auth] API_KEY not set in environment, using generated key');
  console.log('🔑 [auth] Generated API Key:', DEFAULT_API_KEY);
  console.log('💡 [auth] Set API_KEY environment variable for production!');
}

/**
 * Require API key authentication
 * Checks X-API-Key header or api_key query parameter
 */
export function requireAuth(req, res, next) {
  // Check header first
  let apiKey = req.headers['x-api-key'];
  
  // Fallback to query parameter (for convenience in development)
  if (!apiKey) {
    apiKey = req.query.api_key;
  }
  
  if (!apiKey) {
    console.log('[auth] ❌ Unauthorized request:', req.method, req.path, 'from', req.ip);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'API key required. Provide X-API-Key header or api_key query parameter.' 
    });
  }
  
  if (apiKey !== DEFAULT_API_KEY) {
    console.log('[auth] ❌ Invalid API key:', req.method, req.path, 'from', req.ip);
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Invalid API key.' 
    });
  }
  
  // Success
  console.log('[auth] ✅ Authenticated request:', req.method, req.path, 'from', req.ip);
  next();
}

/**
 * Optional authentication (doesn't block if no key provided)
 * Useful for endpoints that work better with auth but don't require it
 */
export function optionalAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (apiKey && apiKey === DEFAULT_API_KEY) {
    req.authenticated = true;
    console.log('[auth] ✅ Authenticated request:', req.method, req.path);
  } else {
    req.authenticated = false;
  }
  
  next();
}

/**
 * Get current API key (for displaying in dashboard)
 */
export function getApiKey() {
  return DEFAULT_API_KEY;
}

/**
 * Generate new API key
 */
export function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

export default {
  requireAuth,
  optionalAuth,
  getApiKey,
  generateApiKey
};
