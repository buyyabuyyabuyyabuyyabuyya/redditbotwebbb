import { createClient } from '@supabase/supabase-js';

export interface CircuitBreakerState {
  worker_type: string;
  status: 'active' | 'circuit_open' | 'backoff' | 'idle';
  consecutive_failures: number;
  last_failure_at?: string;
  backoff_until?: string;
  failure_reasons: string[];
  last_success_at?: string;
}

export class CircuitBreakerService {
  private supabase;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly BASE_BACKOFF_MINUTES = 15;
  private readonly MAX_BACKOFF_MINUTES = 120;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  /**
   * Check if circuit breaker allows execution
   */
  async canExecute(workerType: string = 'posting'): Promise<{
    allowed: boolean;
    reason?: string;
    backoffUntil?: string;
  }> {
    const state = await this.getState(workerType);
    
    if (!state) {
      return { allowed: true };
    }

    // Check if we're in backoff period
    if (state.backoff_until) {
      const backoffUntil = new Date(state.backoff_until);
      const now = new Date();
      
      if (now < backoffUntil) {
        const minutesLeft = Math.ceil((backoffUntil.getTime() - now.getTime()) / (1000 * 60));
        return {
          allowed: false,
          reason: `Circuit breaker in backoff mode. ${minutesLeft} minutes remaining.`,
          backoffUntil: state.backoff_until
        };
      } else {
        // Backoff period expired, reset state
        await this.resetState(workerType);
        return { allowed: true };
      }
    }

    // Check if circuit is open due to consecutive failures
    if (state.status === 'circuit_open') {
      return {
        allowed: false,
        reason: `Circuit breaker open due to ${state.consecutive_failures} consecutive failures.`
      };
    }

    return { allowed: true };
  }

  /**
   * Record a successful execution
   */
  async recordSuccess(workerType: string = 'posting'): Promise<void> {
    await this.supabase
      .from('background_worker_status')
      .upsert({
        worker_type: workerType,
        status: 'active',
        consecutive_failures: 0,
        last_success_at: new Date().toISOString(),
        backoff_until: null,
        failure_reasons: []
      });

    console.log(`[CIRCUIT_BREAKER] Success recorded for ${workerType}`);
  }

  /**
   * Record a failure and potentially trigger circuit breaker
   */
  async recordFailure(
    workerType: string = 'posting',
    reason: string,
    severity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<{
    circuitOpen: boolean;
    backoffTriggered: boolean;
    backoffUntil?: string;
  }> {
    const state = await this.getState(workerType);
    const consecutiveFailures = (state?.consecutive_failures || 0) + 1;
    const failureReasons = [...(state?.failure_reasons || []), reason].slice(-10); // Keep last 10 reasons

    let status = 'active';
    let backoffUntil: string | null = null;
    let circuitOpen = false;
    let backoffTriggered = false;

    // Determine action based on failure count and severity
    if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES || severity === 'high') {
      // Calculate exponential backoff
      const backoffMinutes = Math.min(
        this.BASE_BACKOFF_MINUTES * Math.pow(2, consecutiveFailures - this.MAX_CONSECUTIVE_FAILURES),
        this.MAX_BACKOFF_MINUTES
      );
      
      backoffUntil = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
      status = 'backoff';
      backoffTriggered = true;

      if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES * 2) {
        status = 'circuit_open';
        circuitOpen = true;
      }

      console.log(`[CIRCUIT_BREAKER] ${workerType} entering ${status} mode for ${backoffMinutes} minutes`);
    }

    await this.supabase
      .from('background_worker_status')
      .upsert({
        worker_type: workerType,
        status,
        consecutive_failures: consecutiveFailures,
        last_failure_at: new Date().toISOString(),
        backoff_until: backoffUntil,
        failure_reasons: failureReasons
      });

    return { circuitOpen, backoffTriggered, backoffUntil: backoffUntil || undefined };
  }

  /**
   * Check if there are available Reddit accounts
   */
  async checkAccountAvailability(): Promise<{
    available: boolean;
    count: number;
    reason?: string;
  }> {
    const { data: accounts, error } = await this.supabase
      .from('reddit_accounts')
      .select('id, username, is_available, last_used_at, cooldown_minutes')
      .eq('is_validated', true)
      .eq('is_discussion_poster', true)
      .eq('status', 'active');

    if (error) {
      console.error('[CIRCUIT_BREAKER] Error checking account availability:', error);
      return { available: false, count: 0, reason: 'Database error checking accounts' };
    }

    if (!accounts || accounts.length === 0) {
      return { available: false, count: 0, reason: 'No Reddit accounts configured' };
    }

    // Check how many accounts are actually available (not in cooldown)
    const now = new Date();
    const availableAccounts = accounts.filter(account => {
      if (account.is_available) return true;
      
      if (account.last_used_at) {
        const lastUsed = new Date(account.last_used_at);
        const cooldownMinutes = account.cooldown_minutes || 30;
        const cooldownExpiry = new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);
        return now >= cooldownExpiry;
      }
      
      return false;
    });

    const availableCount = availableAccounts.length;
    
    if (availableCount === 0) {
      const nextAvailable = accounts
        .filter(acc => acc.last_used_at)
        .map(acc => {
          const lastUsed = new Date(acc.last_used_at!);
          const cooldownMinutes = acc.cooldown_minutes || 30;
          return new Date(lastUsed.getTime() + cooldownMinutes * 60 * 1000);
        })
        .sort((a, b) => a.getTime() - b.getTime())[0];

      const minutesUntilNext = nextAvailable 
        ? Math.ceil((nextAvailable.getTime() - now.getTime()) / (1000 * 60))
        : 'unknown';

      return {
        available: false,
        count: 0,
        reason: `All ${accounts.length} accounts in cooldown. Next available in ${minutesUntilNext} minutes.`
      };
    }

    return { available: true, count: availableCount };
  }

  /**
   * Get current circuit breaker state
   */
  private async getState(workerType: string): Promise<CircuitBreakerState | null> {
    const { data, error } = await this.supabase
      .from('background_worker_status')
      .select('*')
      .eq('worker_type', workerType)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[CIRCUIT_BREAKER] Error getting state:', error);
    }

    return data;
  }

  /**
   * Reset circuit breaker state
   */
  private async resetState(workerType: string): Promise<void> {
    await this.supabase
      .from('background_worker_status')
      .upsert({
        worker_type: workerType,
        status: 'active',
        consecutive_failures: 0,
        backoff_until: null,
        failure_reasons: []
      });

    console.log(`[CIRCUIT_BREAKER] State reset for ${workerType}`);
  }

  /**
   * Force reset circuit breaker (admin function)
   */
  async forceReset(workerType: string = 'posting'): Promise<void> {
    await this.resetState(workerType);
    console.log(`[CIRCUIT_BREAKER] Force reset completed for ${workerType}`);
  }
}
