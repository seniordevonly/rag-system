/**
 * Logging and monitoring utilities
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private requestId: string | null = null;

  setRequestId(id: string): void {
    this.requestId = id;
  }

  clearRequestId(): void {
    this.requestId = null;
  }

  private formatLog(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (this.requestId) {
      entry.requestId = this.requestId;
    }

    if (context) {
      entry.context = context;
    }

    return entry;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    const entry = this.formatLog("debug", message, context);
    console.debug(JSON.stringify(entry));
  }

  info(message: string, context?: Record<string, unknown>): void {
    const entry = this.formatLog("info", message, context);
    console.info(JSON.stringify(entry));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    const entry = this.formatLog("warn", message, context);
    console.warn(JSON.stringify(entry));
  }

  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, unknown>,
  ): void {
    const entry = this.formatLog("error", message, context);

    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      entry.error = {
        name: "Unknown",
        message: String(error),
      };
    }

    console.error(JSON.stringify(entry));
  }
}

export const logger = new Logger();

/**
 * Metrics tracking
 */
class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();
  private counters: Map<string, number> = new Map();

  recordDuration(name: string, durationMs: number): void {
    const existing = this.metrics.get(name) || [];
    existing.push(durationMs);
    this.metrics.set(name, existing);
  }

  increment(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  getStats(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getAllMetrics(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [name, _] of this.metrics) {
      result[name] = this.getStats(name);
    }

    for (const [name, value] of this.counters) {
      result[`counter_${name}`] = value;
    }

    return result;
  }

  reset(): void {
    this.metrics.clear();
    this.counters.clear();
  }
}

export const metrics = new MetricsCollector();

/**
 * Performance measurement decorator
 */
export function measurePerformance<
  T extends (...args: unknown[]) => Promise<unknown>,
>(name: string, fn: T): T {
  return (async (...args: unknown[]) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - start;
      metrics.recordDuration(name, duration);
      logger.debug(`${name} completed`, { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      metrics.increment(`${name}_errors`);
      logger.error(`${name} failed`, error, { duration });
      throw error;
    }
  }) as T;
}

/**
 * Request ID generator
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Cost tracking for API calls
 */
class CostTracker {
  private costs: Map<string, number> = new Map();

  record(service: string, cost: number): void {
    const current = this.costs.get(service) || 0;
    this.costs.set(service, current + cost);
  }

  getCost(service: string): number {
    return this.costs.get(service) || 0;
  }

  getTotalCost(): number {
    return Array.from(this.costs.values()).reduce((a, b) => a + b, 0);
  }

  getAllCosts(): Record<string, number> {
    return Object.fromEntries(this.costs);
  }

  reset(): void {
    this.costs.clear();
  }
}

export const costTracker = new CostTracker();

/**
 * OpenAI API cost estimation
 */
export function estimateEmbeddingCost(
  tokenCount: number,
  model: string = "text-embedding-3-small",
): number {
  // Pricing per 1M tokens (as of 2024)
  const pricing: Record<string, number> = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
    "text-embedding-ada-002": 0.1,
  };

  const pricePerMillion = pricing[model] || 0.02;
  return (tokenCount / 1_000_000) * pricePerMillion;
}

export function estimateCompletionCost(
  inputTokens: number,
  outputTokens: number,
  model: string = "gpt-4o",
): number {
  // Pricing per 1M tokens (as of 2024)
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 2.5, output: 10.0 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4-turbo": { input: 10.0, output: 30.0 },
    "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  };

  const modelPricing = pricing[model] || pricing["gpt-4o"];
  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
}
