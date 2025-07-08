'use client';

import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';
import Button, { RippleButton, Button3D } from './ui/Button';
import { createServerSupabaseClient } from '../utils/supabase-server';

const supabase = createClientSupabaseClient();
const supabaseAdmin = createServerSupabaseClient();

interface SubredditScannerProps {
  userId: string;
  redditAccounts: Array<{
    id: string;
    username: string;
  }>;
  messageTemplates: Array<{
    id: string;
    name: string;
    content: string;
  }>;
}

interface ScanConfig {
  id?: string;
  subreddit: string;
  keywords: string[];
  messageTemplateId: string;
  redditAccountId: string;
  isActive: boolean;
  scanInterval: number; // in minutes
}

export default function SubredditScanner({
  userId,
  redditAccounts,
  messageTemplates,
}: SubredditScannerProps) {
  const [configs, setConfigs] = useState<ScanConfig[]>([]);
  const [newConfig, setNewConfig] = useState<ScanConfig>({
    subreddit: '',
    keywords: [],
    messageTemplateId: '',
    redditAccountId: '',
    isActive: false,
    scanInterval: 10,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      try {
        const { data, error } = await supabase
          .from('scan_configs')
          .select('*')
          .eq('user_id', userId);

        if (error && error.code !== '42P01') throw error; // 42P01 is PostgreSQL code for 'table does not exist'
        setConfigs(data || []);
      } catch (e: any) {
        // If table doesn't exist, just use empty array
        if (
          e?.message &&
          typeof e.message === 'string' &&
          e.message.includes('does not exist')
        ) {
          console.warn(
            'scan_configs table does not exist yet, using empty array'
          );
          setConfigs([]);
        } else {
          throw e;
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load configurations'
      );
    }
  };

  const handleAddKeyword = () => {
    if (keyword && !newConfig.keywords.includes(keyword)) {
      setNewConfig({
        ...newConfig,
        keywords: [...newConfig.keywords, keyword],
      });
      setKeyword('');
    }
  };

  const handleRemoveKeyword = (indexToRemove: number) => {
    setNewConfig({
      ...newConfig,
      keywords: newConfig.keywords.filter(
        (_, index) => index !== indexToRemove
      ),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Enforce scan interval limits (10–300 minutes)
    if (newConfig.scanInterval < 10 || newConfig.scanInterval > 300) {
      setIsLoading(false);
      setError('Scan interval must be between 10 and 300 minutes (5 hours).');
      return;
    }

    try {
      const { error: dbError } = await supabaseAdmin
        .from('scan_configs')
        .insert([
          {
            user_id: userId,
            ...newConfig,
          },
        ]);

      if (dbError) throw dbError;

      await loadConfigs();
      setNewConfig({
        subreddit: '',
        keywords: [],
        messageTemplateId: '',
        redditAccountId: '',
        isActive: false,
        scanInterval: 10,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save configuration'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleConfig = async (configId: string, isActive: boolean) => {
    try {
      const { error: dbError } = await supabase
        .from('scan_configs')
        .update({ is_active: isActive })
        .eq('id', configId);

      if (dbError) throw dbError;
      await loadConfigs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update configuration'
      );
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-200">
            Subreddit
          </label>
          <input
            type="text"
            value={newConfig.subreddit}
            onChange={(e) =>
              setNewConfig({ ...newConfig, subreddit: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Keywords
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            />
            <Button
              type="button"
              variant="primary"
              size="medium"
              onClick={handleAddKeyword}
            >
              Add
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {newConfig.keywords.map((kw, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900 text-blue-200"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(index)}
                  className="ml-1 inline-flex text-blue-300 hover:text-blue-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Reddit Account
          </label>
          <select
            value={newConfig.redditAccountId}
            onChange={(e) =>
              setNewConfig({ ...newConfig, redditAccountId: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            required
          >
            <option value="">Select an account</option>
            {redditAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.username}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Message Template
          </label>
          <select
            value={newConfig.messageTemplateId}
            onChange={(e) =>
              setNewConfig({ ...newConfig, messageTemplateId: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            required
          >
            <option value="">Select a template</option>
            {messageTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200">
            Scan Interval (minutes)
          </label>
          <input
            type="number"
            min="10"
            max="300"
            value={newConfig.scanInterval}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              setNewConfig({
                ...newConfig,
                scanInterval: val,
              });
            }}
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 placeholder-gray-400"
            required
          />
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <RippleButton
          type="submit"
          variant="primary"
          size="medium"
          disabled={isLoading}
          fullWidth
        >
          {isLoading ? 'Saving...' : 'Save Configuration'}
        </RippleButton>
      </form>

      <div className="mt-8">
        <h3 className="text-lg font-medium text-white">
          Active Configurations
        </h3>
        <div className="mt-4 space-y-4">
          {configs.map((config) => (
            <div
              key={config.id}
              className="border border-gray-700 bg-gray-800/50 rounded-lg p-4 flex items-center justify-between hover:border-indigo-500/30 transition-colors duration-200"
            >
              <div>
                <h4 className="font-medium text-white">r/{config.subreddit}</h4>
                <p className="text-sm text-gray-400">
                  Keywords: {config.keywords.join(', ')}
                </p>
                <p className="text-sm text-gray-400">
                  Scan interval: {config.scanInterval} minutes
                </p>
              </div>
              <div>
                <Button3D
                  onClick={() =>
                    config.id && toggleConfig(config.id, !config.isActive)
                  }
                  variant={config.isActive ? 'danger' : 'success'}
                  size="small"
                >
                  {config.isActive ? 'Stop' : 'Start'}
                </Button3D>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
