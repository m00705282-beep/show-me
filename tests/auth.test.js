/* global describe, it */
/**
 * Authentication Middleware Tests
 */

import { expect } from 'chai';
import { requireAuth, getApiKey } from '../middleware/auth.js';

describe('Authentication', () => {
  describe('getApiKey()', () => {
    it('should return an API key', () => {
      const apiKey = getApiKey();
      expect(apiKey).to.be.a('string');
      expect(apiKey.length).to.be.greaterThan(16);
    });
  });

  describe('requireAuth()', () => {
    it('should reject request without API key', (done) => {
      const req = {
        headers: {},
        query: {},
        ip: '127.0.0.1',
        method: 'GET',
        path: '/test'
      };

      const res = {
        status: (code) => {
          expect(code).to.equal(401);
          return {
            json: (data) => {
              expect(data).to.have.property('error');
              expect(data.error).to.equal('Unauthorized');
              done();
            }
          };
        }
      };

      requireAuth(req, res, () => {});
    });

    it('should accept request with valid API key', (done) => {
      const validApiKey = getApiKey();

      const req = {
        headers: { 'x-api-key': validApiKey },
        query: {},
        ip: '127.0.0.1',
        method: 'GET',
        path: '/test'
      };

      const res = {
        status: () => ({ json: () => {} })
      };

      const next = () => {
        // If next is called, authentication passed
        done();
      };

      requireAuth(req, res, next);
    });

    it('should reject request with invalid API key', (done) => {
      const req = {
        headers: { 'x-api-key': 'invalid-key' },
        query: {},
        ip: '127.0.0.1',
        method: 'GET',
        path: '/test'
      };

      const res = {
        status: (code) => {
          expect(code).to.equal(403);
          return {
            json: (data) => {
              expect(data).to.have.property('error');
              expect(data.error).to.equal('Forbidden');
              done();
            }
          };
        }
      };

      requireAuth(req, res, () => {});
    });
  });
});
