'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Play, Pause, Settings, Clock, Target, TrendingUp } from 'lucide-react';

interface AutoPosterSettingsProps {
  productId: string;
  accountId: string;
}

interface AutoPosterConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxPostsPerDay: number;
  onlyHighScoreReplies: boolean;
  lastPostedAt: string | null;
  nextPostAt: string | null;
  postsToday?: number;
  accountId?: string;
}

export default function AutoPosterSettings({ productId, accountId }: AutoPosterSettingsProps) {
  const [config, setConfig] = useState<AutoPosterConfig>({
    enabled: false,
    intervalMinutes: 30,
    maxPostsPerDay: 10,
    onlyHighScoreReplies: true,
    lastPostedAt: null,
    nextPostAt: null,
    postsToday: 0,
    accountId: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [productId]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`/api/beno/auto-poster?productId=${productId}`);
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error('Failed to fetch auto-poster config:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (updates: Partial<AutoPosterConfig>) => {
    try {
      setSaving(true);
      const newConfig = { ...config, ...updates };
      
      const res = await fetch('/api/beno/auto-poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          accountId,
          settings: newConfig
        })
      });

      const data = await res.json();
      if (data.success) {
        setConfig(newConfig);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to update config:', error);
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleAutoPoster = async () => {
    if (!config.enabled) {
      // Starting automation - setup Upstash cron
      try {
        setSaving(true);
        const res = await fetch('/api/upstash/setup-cron', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            accountId,
            intervalMinutes: config.intervalMinutes
          })
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error);
        }

        await updateConfig({ enabled: true });
        alert('Auto-posting started with Upstash scheduling!');
      } catch (error) {
        console.error('Failed to setup Upstash:', error);
        alert('Failed to setup automated scheduling');
      } finally {
        setSaving(false);
      }
    } else {
      // Stopping automation - remove Upstash cron
      try {
        setSaving(true);
        await fetch(`/api/upstash/setup-cron?configId=${productId}`, {
          method: 'DELETE'
        });
        await updateConfig({ enabled: false });
        alert('Auto-posting stopped and scheduled jobs removed');
      } catch (error) {
        console.error('Failed to stop automation:', error);
        alert('Failed to stop automation');
      } finally {
        setSaving(false);
      }
    }
  };

  const runWorkerNow = async () => {
    try {
      setSaving(true);
      
      // Run discovery and generation
      await fetch('/api/beno/background-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discover_and_generate' })
      });

      // Run auto-posting
      const res = await fetch('/api/beno/background-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_post' })
      });

      const data = await res.json();
      if (data.success) {
        alert(`Worker completed: ${data.message}`);
        fetchConfig(); // Refresh stats
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Worker failed:', error);
      alert('Worker failed to run');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading auto-poster settings...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {config.enabled ? (
                  <Play className="h-5 w-5 text-green-600" />
                ) : (
                  <Pause className="h-5 w-5 text-gray-400" />
                )}
                Auto-Posting Status
              </CardTitle>
              <CardDescription>
                Continuous Reddit posting for your product
              </CardDescription>
            </div>
            <Badge variant={config.enabled ? 'default' : 'outline'}>
              {config.enabled ? 'Active' : 'Paused'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Target className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{config.postsToday}</div>
              <div className="text-sm text-gray-600">Posts Today</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{config.intervalMinutes}m</div>
              <div className="text-sm text-gray-600">Interval</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{config.maxPostsPerDay}</div>
              <div className="text-sm text-gray-600">Daily Limit</div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={toggleAutoPoster}
              variant={config.enabled ? 'danger' : 'primary'}
              disabled={saving}
            >
              {config.enabled ? 'Pause Auto-Posting' : 'Start Auto-Posting'}
            </Button>
            <Button
              onClick={() => setShowSettings(!showSettings)}
              variant="secondary"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button
              onClick={runWorkerNow}
              variant="secondary"
              disabled={saving}
            >
              {saving ? 'Running...' : 'Run Now'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Panel */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Auto-Posting Settings</CardTitle>
            <CardDescription>
              Configure how often and when to post replies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Posting Interval (minutes)
              </label>
              <select
                value={config.intervalMinutes}
                onChange={(e) => updateConfig({ intervalMinutes: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={saving}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Posts Per Day
              </label>
              <select
                value={config.maxPostsPerDay}
                onChange={(e) => updateConfig({ maxPostsPerDay: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={saving}
              >
                <option value={5}>5 posts</option>
                <option value={10}>10 posts</option>
                <option value={15}>15 posts</option>
                <option value={20}>20 posts</option>
                <option value={30}>30 posts</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="highScoreOnly"
                checked={config.onlyHighScoreReplies}
                onChange={(e) => updateConfig({ onlyHighScoreReplies: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={saving}
              />
              <label htmlFor="highScoreOnly" className="ml-2 block text-sm text-gray-900">
                Only post high-quality replies (80%+ relevance score)
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Info */}
      {config.lastPostedAt && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">
              <p><strong>Last Posted:</strong> {config.lastPostedAt ? new Date(config.lastPostedAt).toLocaleString() : 'Never'}</p>
              {config.nextPostAt && (
                <p><strong>Next Post:</strong> {new Date(config.nextPostAt).toLocaleString()}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
