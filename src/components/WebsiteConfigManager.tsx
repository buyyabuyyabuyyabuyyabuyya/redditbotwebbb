'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

interface WebsiteConfig {
  id: string;
  user_id: string;
  product_id?: string;
  website_url: string;
  website_description: string;
  customer_segments: string[];
  target_keywords: string[];
  negative_keywords: string[];
  business_context_terms: string[];
  relevance_threshold: number;
  auto_poster_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface WebsiteConfigManagerProps {
  productId?: string;
  onConfigSaved?: () => void;
  onConfigsChange?: () => void;
  initialConfig?: Partial<WebsiteConfig>;
}

export default function WebsiteConfigManager({
  productId,
  onConfigSaved,
  onConfigsChange,
  initialConfig
}: WebsiteConfigManagerProps) {
  const { user } = useUser();
  const [config, setConfig] = useState<Partial<WebsiteConfig>>({
    website_url: '',
    website_description: '',
    customer_segments: [],
    target_keywords: [],
    negative_keywords: [],
    business_context_terms: [],
    relevance_threshold: 70,
    auto_poster_enabled: false,
    ...initialConfig
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingConfigs, setExistingConfigs] = useState<WebsiteConfig[]>([]);

  // Input states for arrays
  const [newSegment, setNewSegment] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newNegativeKeyword, setNewNegativeKeyword] = useState('');
  const [newContextTerm, setNewContextTerm] = useState('');

  useEffect(() => {
    if (user) {
      loadExistingConfigs();
    }
  }, [user, productId]);

  const loadExistingConfigs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (productId) params.append('productId', productId);

      const response = await fetch(`/api/website-config?${params}`);
      const data = await response.json();

      if (data.configs) {
        setExistingConfigs(data.configs);

        // If we have an existing config for this product, load it
        if (data.configs.length > 0 && !initialConfig) {
          setConfig(data.configs[0]);
        }
      }
    } catch (error) {
      console.error('Error loading website configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.website_url || !config.website_description) {
      alert('Website URL and description are required');
      return;
    }

    setSaving(true);
    try {
      const method = config.id ? 'PUT' : 'POST';
      const body = {
        ...config,
        productId,
        configId: config.id
      };

      const response = await fetch('/api/website-config', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.config) {
        setConfig(data.config);
        onConfigSaved?.();
        onConfigsChange?.();
        await loadExistingConfigs(); // Refresh the list
      } else {
        alert('Error saving configuration: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving website config:', error);
      alert('Error saving configuration');
    } finally {
      setSaving(false);
    }
  };

  const addToArray = (arrayName: keyof WebsiteConfig, value: string, setter: (val: string) => void) => {
    if (!value.trim()) return;

    const currentArray = (config[arrayName] as string[]) || [];
    if (!currentArray.includes(value.trim())) {
      setConfig(prev => ({
        ...prev,
        [arrayName]: [...currentArray, value.trim()]
      }));
    }
    setter('');
  };

  const removeFromArray = (arrayName: keyof WebsiteConfig, index: number) => {
    const currentArray = (config[arrayName] as string[]) || [];
    setConfig(prev => ({
      ...prev,
      [arrayName]: currentArray.filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-400">Loading website configuration...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Website Configuration</h2>
        {existingConfigs.length > 0 && (
          <div className="text-sm text-gray-400">
            {existingConfigs.length} saved configuration{existingConfigs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Website URL */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Website URL *
        </label>
        <input
          type="url"
          value={config.website_url || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, website_url: e.target.value }))}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="https://example.com"
        />
      </div>

      {/* Website Description */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Website Description *
        </label>
        <textarea
          value={config.website_description || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, website_description: e.target.value }))}
          rows={4}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Describe what your website/product does and who it's for..."
        />
      </div>

      {/* Customer Segments */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Customer Segments
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newSegment}
            onChange={(e) => setNewSegment(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addToArray('customer_segments', newSegment, setNewSegment)}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="e.g., small business owners, digital marketers"
          />
          <button
            onClick={() => addToArray('customer_segments', newSegment, setNewSegment)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.customer_segments || []).map((segment, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm"
            >
              {segment}
              <button
                onClick={() => removeFromArray('customer_segments', index)}
                className="ml-2 text-purple-600 hover:text-purple-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Target Keywords */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Target Keywords
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addToArray('target_keywords', newKeyword, setNewKeyword)}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="e.g., productivity, automation, CRM"
          />
          <button
            onClick={() => addToArray('target_keywords', newKeyword, setNewKeyword)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.target_keywords || []).map((keyword, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
            >
              {keyword}
              <button
                onClick={() => removeFromArray('target_keywords', index)}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Negative Keywords */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Negative Keywords (posts to avoid)
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newNegativeKeyword}
            onChange={(e) => setNewNegativeKeyword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addToArray('negative_keywords', newNegativeKeyword, setNewNegativeKeyword)}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="e.g., politics, news, entertainment"
          />
          <button
            onClick={() => addToArray('negative_keywords', newNegativeKeyword, setNewNegativeKeyword)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.negative_keywords || []).map((keyword, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm"
            >
              {keyword}
              <button
                onClick={() => removeFromArray('negative_keywords', index)}
                className="ml-2 text-red-600 hover:text-red-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Business Context Terms */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Business Context Terms
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newContextTerm}
            onChange={(e) => setNewContextTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addToArray('business_context_terms', newContextTerm, setNewContextTerm)}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="e.g., SaaS, software, platform, tool"
          />
          <button
            onClick={() => addToArray('business_context_terms', newContextTerm, setNewContextTerm)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.business_context_terms || []).map((term, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
            >
              {term}
              <button
                onClick={() => removeFromArray('business_context_terms', index)}
                className="ml-2 text-green-600 hover:text-green-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Relevance Threshold */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Relevance Threshold: {config.relevance_threshold}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={config.relevance_threshold || 70}
          onChange={(e) => setConfig(prev => ({ ...prev, relevance_threshold: parseInt(e.target.value) }))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>Less Strict</span>
          <span>More Strict</span>
        </div>
      </div>
      {

        /*        
      
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-300">
            Enable Auto Poster
          </label>
          <p className="text-xs text-gray-400">
            Automatically post replies to relevant discussions
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.auto_poster_enabled || false}
            onChange={(e) => setConfig(prev => ({ ...prev, auto_poster_enabled: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
        </label>
      </div> */}

      {/* Save & Delete Buttons */}
      <div className="flex justify-end gap-3">
        {config.id && (
          <button
            onClick={async () => {
              if (confirm('Are you sure you want to delete this configuration? This action cannot be undone.')) {
                setSaving(true);
                try {
                  const response = await fetch(`/api/website-config?configId=${config.id}`, {
                    method: 'DELETE',
                  });
                  const data = await response.json();
                  if (data.success) {
                    await loadExistingConfigs();
                    // Reset to empty state or first available
                    onConfigsChange?.();
                    setConfig({
                      website_url: '',
                      website_description: '',
                      customer_segments: [],
                      target_keywords: [],
                      negative_keywords: [],
                      business_context_terms: [],
                      relevance_threshold: 70,
                      auto_poster_enabled: false
                    });
                  } else {
                    alert('Error deleting configuration: ' + (data.error || 'Unknown error'));
                  }
                } catch (error) {
                  console.error('Error deleting config:', error);
                  alert('Error deleting configuration');
                } finally {
                  setSaving(false);
                }
              }
            }}
            disabled={saving}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !config.website_url || !config.website_description}
          className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : config.id ? 'Update Configuration' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
