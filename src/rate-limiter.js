class RateLimiter {
    constructor(limitPerMinute = 40) {
        this.limit = limitPerMinute;
        this.timestamps = [];
    }

    async record() {
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;
        this.timestamps = this.timestamps.filter(ts => ts > oneMinuteAgo);
        if (this.timestamps.length >= this.limit) {
            const oldest = this.timestamps[0];
            const waitMs = 1000 - (now - oldest);
            if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
            return this.record();
        }
        this.timestamps.push(now);
    }
}

module.exports = RateLimiter;