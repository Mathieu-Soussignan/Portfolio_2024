/**
 * Minimal in-memory rate limiter (sliding window per key, typically IP).
 *
 * The portfolio is public; this prevents a visitor or bot from burning through
 * the Mistral free quota. No external infrastructure — a single-instance
 * in-memory map is enough for a portfolio site.
 */

export interface RateLimiterOptions {
	windowMs?: number;
	maxRequests?: number;
}

export interface RateLimitResult {
	allowed: boolean;
	retryAfterMs?: number;
}

export interface RateLimiter {
	check(key: string): RateLimitResult;
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
	const windowMs = options.windowMs ?? 60_000;
	const maxRequests = options.maxRequests ?? 10;
	const hits = new Map<string, number[]>();

	return {
		check(key: string): RateLimitResult {
			const now = Date.now();
			const cutoff = now - windowMs;
			const list = (hits.get(key) ?? []).filter((t) => t > cutoff);

			if (list.length >= maxRequests) {
				const retryAfterMs = Math.max(list[0] + windowMs - now, 1000);
				hits.set(key, list);
				return { allowed: false, retryAfterMs };
			}

			list.push(now);
			hits.set(key, list);
			return { allowed: true };
		},
	};
}
