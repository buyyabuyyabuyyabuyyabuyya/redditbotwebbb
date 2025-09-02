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

export default function WebsiteConfigManagerStepByStep({ 
  productId, 
  onConfigSaved, 
  onConfigsChange,
  initialConfig 
}: WebsiteConfigManagerProps) {
  const { user } = useUser();
  const [currentStep, setCurrentStep] = useState(1);
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
  const [analyzing, setAnalyzing] = useState(false);
  const [existingConfigs, setExistingConfigs] = useState<WebsiteConfig[]>([]);
  const [newSegment, setNewSegment] = useState('');
  const [newTargetKeyword, setNewTargetKeyword] = useState('');
  const [newNegativeKeyword, setNewNegativeKeyword] = useState('');
  const [newBusinessTerm, setNewBusinessTerm] = useState('');

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
        
        if (data.configs.length > 0 && !initialConfig) {
          // Don't auto-load existing config, always start fresh
          // setConfig(data.configs[0]);
          // setCurrentStep(4);
        }
      }
    } catch (error) {
      console.error('Error loading website configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeWebsite = async () => {
    if (!config.website_url) {
      alert('Please enter a website URL first');
      return;
    }

    setAnalyzing(true);
    try {
      const response = await fetch('/api/website-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.website_url })
      });

      const data = await response.json();
      
      if (data.success) {
        setConfig(prev => ({
          ...prev,
          website_description: data.description || prev.website_description,
          customer_segments: data.customerSegments || prev.customer_segments,
          target_keywords: data.targetKeywords || prev.target_keywords,
          negative_keywords: data.negativeKeywords || prev.negative_keywords,
          business_context_terms: data.businessTerms || prev.business_context_terms
        }));
        
        // Auto-advance to next step
        setCurrentStep(2);
      } else {
        alert('Error analyzing website: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error analyzing website:', error);
      alert('Error analyzing website');
    } finally {
      setAnalyzing(false);
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
      
      // Generate a UUID if not provided
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
      
      const finalProductId = productId || generateUUID();
      
      const body = {
        productId: finalProductId,
        configId: config.id,
        websiteUrl: config.website_url,
        websiteDescription: config.website_description,
        customerSegments: config.customer_segments || [],
        targetKeywords: config.target_keywords || [],
        negativeKeywords: config.negative_keywords || [],
        businessContextTerms: config.business_context_terms || [],
        relevanceThreshold: config.relevance_threshold || 70,
        autoPostersEnabled: config.auto_poster_enabled || false
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
        await loadExistingConfigs();
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

  const addKeyword = (arrayName: keyof WebsiteConfig, value: string) => {
    if (!value.trim()) return;
    
    const currentArray = (config[arrayName] as string[]) || [];
    if (!currentArray.includes(value.trim())) {
      setConfig(prev => ({
        ...prev,
        [arrayName]: [...currentArray, value.trim()]
      }));
    }
  };

  const removeKeyword = (arrayName: keyof WebsiteConfig, index: number) => {
    const currentArray = (config[arrayName] as string[]) || [];
    setConfig(prev => ({
      ...prev,
      [arrayName]: currentArray.filter((_, i) => i !== index)
    }));
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Step 1: Enter Your Website</h3>
        <p className="text-gray-400">Let's start by analyzing your website</p>
      </div>

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

      <div className="flex gap-3">
        <button
          onClick={analyzeWebsite}
          disabled={analyzing || !config.website_url}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {analyzing ? 'Analyzing Website...' : 'Analyze Website'}
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          disabled={!config.website_url}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed"
        >
          Skip Analysis
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Step 2: Website Description</h3>
        <p className="text-gray-400">Describe what your website does</p>
      </div>

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

      <div className="flex gap-3">
        <button
          onClick={() => setCurrentStep(1)}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          disabled={!config.website_description}
          className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const handleAddItem = (arrayName: keyof WebsiteConfig, value: string, setValue: (val: string) => void) => {
    if (value.trim()) {
      addKeyword(arrayName, value.trim());
      setValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, arrayName: keyof WebsiteConfig, value: string, setValue: (val: string) => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem(arrayName, value, setValue);
    }
  };

  const renderStep3 = () => {

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Step 3: Customer Segments & Keywords</h3>
          <p className="text-gray-400">Define your target audience and keywords for AI scoring</p>
        </div>

        {/* Customer Segments */}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Customer Segments
            </label>
            <div className="group relative">
              <span className="text-gray-400 cursor-help">ℹ️</span>
              <div className="invisible group-hover:visible absolute left-6 top-0 bg-gray-900 text-white text-xs rounded p-2 w-64 z-10">
                <strong>Scoring Impact:</strong> Posts mentioning these segments get +20 points. Used to find discussions where your target customers are active.
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Who are your ideal customers? (e.g., entrepreneurs, small business owners, marketers)</p>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newSegment}
              onChange={(e) => setNewSegment(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'customer_segments', newSegment, setNewSegment)}
              placeholder="Add customer segment..."
              className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={() => handleAddItem('customer_segments', newSegment, setNewSegment)}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
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
                  onClick={() => removeKeyword('customer_segments', index)}
                  className="ml-2 text-purple-600 hover:text-purple-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Target Keywords */}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Target Keywords
            </label>
            <div className="group relative">
              <span className="text-gray-400 cursor-help">ℹ️</span>
              <div className="invisible group-hover:visible absolute left-6 top-0 bg-gray-900 text-white text-xs rounded p-2 w-64 z-10">
                <strong>Scoring Impact:</strong> Posts containing these keywords get +15 points. Primary terms that indicate relevant discussions.
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Keywords that indicate relevant discussions for your business</p>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newTargetKeyword}
              onChange={(e) => setNewTargetKeyword(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'target_keywords', newTargetKeyword, setNewTargetKeyword)}
              placeholder="Add target keyword..."
              className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleAddItem('target_keywords', newTargetKeyword, setNewTargetKeyword)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
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
                  onClick={() => removeKeyword('target_keywords', index)}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Business Context Terms */}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Business Context Terms
            </label>
            <div className="group relative">
              <span className="text-gray-400 cursor-help">ℹ️</span>
              <div className="invisible group-hover:visible absolute left-6 top-0 bg-gray-900 text-white text-xs rounded p-2 w-64 z-10">
                <strong>Scoring Impact:</strong> Posts with these terms get +10 points. Industry-specific terminology that adds context relevance.
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Industry-specific terms that provide business context</p>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newBusinessTerm}
              onChange={(e) => setNewBusinessTerm(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'business_context_terms', newBusinessTerm, setNewBusinessTerm)}
              placeholder="Add business term..."
              className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={() => handleAddItem('business_context_terms', newBusinessTerm, setNewBusinessTerm)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
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
                  onClick={() => removeKeyword('business_context_terms', index)}
                  className="ml-2 text-green-600 hover:text-green-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Negative Keywords */}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Negative Keywords
            </label>
            <div className="group relative">
              <span className="text-gray-400 cursor-help">ℹ️</span>
              <div className="invisible group-hover:visible absolute left-6 top-0 bg-gray-900 text-white text-xs rounded p-2 w-64 z-10">
                <strong>Scoring Impact:</strong> Posts with these keywords get -25 points and are filtered out. Use to avoid irrelevant or inappropriate content.
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Keywords that indicate posts to avoid (e.g., politics, entertainment, memes)</p>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newNegativeKeyword}
              onChange={(e) => setNewNegativeKeyword(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'negative_keywords', newNegativeKeyword, setNewNegativeKeyword)}
              placeholder="Add negative keyword..."
              className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              onClick={() => handleAddItem('negative_keywords', newNegativeKeyword, setNewNegativeKeyword)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
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
                  onClick={() => removeKeyword('negative_keywords', index)}
                  className="ml-2 text-red-600 hover:text-red-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Scoring Logic Explanation */}
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-300 mb-2">🎯 How Scoring Works</h4>
          <div className="text-xs text-gray-300 space-y-1">
            <div>• <strong className="text-purple-300">Customer Segments:</strong> +20 points when mentioned</div>
            <div>• <strong className="text-blue-300">Target Keywords:</strong> +15 points when found</div>
            <div>• <strong className="text-green-300">Business Terms:</strong> +10 points for context relevance</div>
            <div>• <strong className="text-red-300">Negative Keywords:</strong> -25 points and filtered out</div>
            <div className="pt-1 border-t border-blue-700">
              <strong>Final Score:</strong> Posts above your relevance threshold get AI-generated replies
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setCurrentStep(2)}
            className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Back
          </button>
          <button
            onClick={() => setCurrentStep(4)}
            className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  };

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Step 4: Final Settings</h3>
        <p className="text-gray-400">Configure relevance threshold and save</p>
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

      {/* Auto Poster Toggle */}
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
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setCurrentStep(3)}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !config.website_url || !config.website_description}
          className="flex-1 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : config.id ? 'Update Configuration' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-400">Loading website configuration...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step <= currentStep
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              {step}
            </div>
          ))}
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
      {currentStep === 4 && renderStep4()}

      {/* Existing Configurations */}
      {existingConfigs.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-600">
          <h4 className="text-lg font-semibold text-white mb-4">Your Website Configurations</h4>
          <div className="grid gap-4">
            {existingConfigs.map((existingConfig) => (
              <div key={existingConfig.id} className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium text-white mb-1">{existingConfig.website_url}</h5>
                    <p className="text-sm text-gray-300 mb-2">{existingConfig.website_description}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                        {existingConfig.customer_segments?.length || 0} segments
                      </span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {existingConfig.target_keywords?.length || 0} keywords
                      </span>
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                        {existingConfig.business_context_terms?.length || 0} business terms
                      </span>
                      <span className="bg-red-100 text-red-800 px-2 py-1 rounded">
                        {existingConfig.negative_keywords?.length || 0} negative keywords
                      </span>
                      <span className={`px-2 py-1 rounded ${existingConfig.auto_poster_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        Auto-poster: {existingConfig.auto_poster_enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => {
                        setConfig(existingConfig);
                        setCurrentStep(1);
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setConfig({
                          website_url: '',
                          website_description: '',
                          customer_segments: [],
                          target_keywords: [],
                          negative_keywords: [],
                          business_context_terms: [],
                          relevance_threshold: 70,
                          auto_poster_enabled: false,
                        });
                        setCurrentStep(1);
                      }}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      New Config
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
