/**
 * Rate limiting middleware for API routes
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  check(
    identifier: string,
    config: RateLimitConfig,
  ): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const entry = this.store.get(identifier);

    // No existing entry or expired
    if (!entry || now > entry.resetTime) {
      const resetTime = now + config.windowMs;
      this.store.set(identifier, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime,
      };
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    // Increment count
    entry.count++;
    this.store.set(identifier, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  reset(identifier: string): void {
    this.store.delete(identifier);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

const globalRateLimiter = new RateLimiter();

/**
 * Default rate limit configurations
 */
export const RATE_LIMITS = {
  chat: {
    windowMs: 60000, // 1 minute
    maxRequests: 20, // 20 requests per minute
  },
  upload: {
    windowMs: 3600000, // 1 hour
    maxRequests: 50, // 50 uploads per hour
  },
  search: {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // 30 searches per minute
  },
  api: {
    windowMs: 60000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
};

/**
 * Get client identifier from request
 */
function getClientIdentifier(request: NextRequest): string {
  // Try to get user ID from session/auth (implement based on your auth system)
  // For now, use IP address as identifier
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded ? forwarded.split(",")[0] : realIp || "unknown";
  return ip;
}

/**
 * Rate limiting middleware wrapper
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = RATE_LIMITS.api,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const identifier = getClientIdentifier(request);
    const result = globalRateLimiter.check(identifier, config);

    // Add rate limit headers
    const headers = {
      "X-RateLimit-Limit": String(config.maxRequests),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.resetTime),
    };

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retryAfter,
        },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    // Execute handler and add rate limit headers to response
    try {
      const response = await handler(request);

      // Add headers to successful response
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }

      return response;
    } catch (error) {
      console.error("Handler error:", error);
      throw error;
    }
  };
}

/**
 * Simple in-memory rate limiter for API routes
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.api,
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  return globalRateLimiter.check(identifier, config);
}

/**
 * Reset rate limit for identifier
 */
export function resetRateLimit(identifier: string): void {
  globalRateLimiter.reset(identifier);
}
