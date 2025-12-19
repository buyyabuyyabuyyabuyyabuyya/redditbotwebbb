import { createClient } from '@supabase/supabase-js';

interface QuotaStatus {
    requests_used: number;
    daily_limit: number;
    last_reset: string;
    is_quota_exceeded: boolean;
    next_reset: string;
}

export class GroqQuotaManager {
    private supabase;
    private readonly DAILY_LIMIT = 180;

    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );
    }

    /**
     * Check if we can make a Groq API request
     */
    async canMakeRequest(): Promise<{ allowed: boolean; reason?: string; quotaStatus?: QuotaStatus }> {
        const quotaStatus = await this.getQuotaStatus();

        if (quotaStatus.is_quota_exceeded) {
            return {
                allowed: false,
                reason: `Daily Groq quota exceeded (${quotaStatus.requests_used}/${quotaStatus.daily_limit}). Resets at ${quotaStatus.next_reset}`,
                quotaStatus
            };
        }

        if (quotaStatus.requests_used >= this.DAILY_LIMIT) {
            return {
                allowed: false,
                reason: `Approaching daily limit (${quotaStatus.requests_used}/${this.DAILY_LIMIT}). Saving quota for critical requests.`,
                quotaStatus
            };
        }

        return { allowed: true, quotaStatus };
    }

    /**
     * Record a successful Groq API request
     */
    async recordRequest(): Promise<void> {
        const today = new Date().toISOString().split('T')[0];

        const { data: current } = await this.supabase
            .from('groq_quota_tracking')
            .select('requests_used')
            .eq('date', today)
            .single();

        const currentCount = current?.requests_used || 0;

        await this.supabase
            .from('groq_quota_tracking')
            .upsert({
                date: today,
                requests_used: currentCount + 1,
                last_request_at: new Date().toISOString()
            }, {
                onConflict: 'date'
            });
    }

    /**
     * Record a quota exceeded error
     */
    async recordQuotaExceeded(): Promise<void> {
        const today = new Date().toISOString().split('T')[0];

        await this.supabase
            .from('groq_quota_tracking')
            .upsert({
                date: today,
                is_quota_exceeded: true,
                quota_exceeded_at: new Date().toISOString()
            }, {
                onConflict: 'date'
            });
    }

    /**
     * Get current quota status
     */
    private async getQuotaStatus(): Promise<QuotaStatus> {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await this.supabase
            .from('groq_quota_tracking')
            .select('*')
            .eq('date', today)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('[QUOTA] Error getting quota status:', error);
        }

        const requestsUsed = data?.requests_used || 0;
        const isQuotaExceeded = data?.is_quota_exceeded || false;

        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);

        return {
            requests_used: requestsUsed,
            daily_limit: this.DAILY_LIMIT,
            last_reset: today,
            is_quota_exceeded: isQuotaExceeded,
            next_reset: tomorrow.toISOString()
        };
    }

    /**
     * Get quota statistics
     */
    async getQuotaStats(): Promise<{
        today: QuotaStatus;
        weeklyAverage: number;
        daysUntilReset: number;
    }> {
        const today = await this.getQuotaStatus();

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data: weeklyData } = await this.supabase
            .from('groq_quota_tracking')
            .select('requests_used')
            .gte('date', weekAgo.toISOString().split('T')[0])
            .order('date', { ascending: false });

        const weeklyAverage = weeklyData?.length
            ? weeklyData.reduce((sum, day) => sum + (day.requests_used || 0), 0) / weeklyData.length
            : 0;

        const now = new Date();
        const nextReset = new Date(today.next_reset);
        const daysUntilReset = Math.ceil((nextReset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
            today,
            weeklyAverage: Math.round(weeklyAverage),
            daysUntilReset
        };
    }
}

// Legacy export for backwards compatibility
export const GeminiQuotaManager = GroqQuotaManager;
