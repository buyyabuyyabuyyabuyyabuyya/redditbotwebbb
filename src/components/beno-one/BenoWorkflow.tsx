'use client';

import { useState } from 'react';
import CustomerFinding from './CustomerFinding';
import RedditPoster from './RedditPoster';
import AutoPosterSettings from './AutoPosterSettings';
import { DiscussionItem } from '../../types/beno-workflow';

type WorkflowStep = 'input' | 'finding' | 'posting' | 'automation';

export default function BenoWorkflow() {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('input');
  const [productData, setProductData] = useState({
    url: '',
    name: '',
    description: '',
    segments: [] as string[]
  });
  const [productId, setProductId] = useState<string>('');
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const handleInputSubmit = (data: typeof productData) => {
    setProductData(data);
    setCurrentStep('finding');
  };

  const handleCustomersFound = (id: string, foundDiscussions: DiscussionItem[], creatorId: string) => {
    setProductId(id);
    setDiscussions(foundDiscussions);
    setCurrentStep('posting');
  };

  const handleSetupAutomation = () => {
    setCurrentStep('automation');
  };

  const handleBack = () => {
    if (currentStep === 'automation') {
      setCurrentStep('posting');
    } else if (currentStep === 'posting') {
      setCurrentStep('finding');
    } else if (currentStep === 'finding') {
      setCurrentStep('input');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">Beno AI Workflow</h1>
          <div className="flex items-center space-x-4">
            <div className={`flex items-center ${currentStep === 'input' ? 'text-blue-600' : currentStep === 'finding' || currentStep === 'posting' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'input' ? 'bg-blue-100' : currentStep === 'finding' || currentStep === 'posting' ? 'bg-green-100' : 'bg-gray-100'}`}>
                1
              </div>
              <span className="ml-2">Product Input</span>
            </div>
            <div className="w-8 h-px bg-gray-300"></div>
            <div className={`flex items-center ${currentStep === 'finding' ? 'text-blue-600' : currentStep === 'posting' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'finding' ? 'bg-blue-100' : currentStep === 'posting' ? 'bg-green-100' : 'bg-gray-100'}`}>
                2
              </div>
              <span className="ml-2">Find Customers</span>
            </div>
            <div className="w-8 h-px bg-gray-300"></div>
            <div className={`flex items-center ${currentStep === 'posting' ? 'text-blue-600' : currentStep === 'automation' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'posting' ? 'bg-blue-100' : currentStep === 'automation' ? 'bg-green-100' : 'bg-gray-100'}`}>
                3
              </div>
              <span className="ml-2">Manual Posting</span>
            </div>
            <div className="w-8 h-px bg-gray-300"></div>
            <div className={`flex items-center ${currentStep === 'automation' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'automation' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                4
              </div>
              <span className="ml-2">Auto-Posting</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step content */}
      {currentStep === 'input' && (
        <ProductInput onSubmit={handleInputSubmit} />
      )}

      {currentStep === 'finding' && (
        <CustomerFinding
          url={productData.url}
          name={productData.name}
          description={productData.description}
          segments={productData.segments}
          onCustomersFound={handleCustomersFound}
          onBack={handleBack}
        />
      )}

      {currentStep === 'posting' && (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={handleBack}
              className="text-blue-600 hover:text-blue-800 flex items-center"
            >
              ← Back to Customer Finding
            </button>
            <button
              onClick={handleSetupAutomation}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
            >
              Setup Auto-Posting →
            </button>
          </div>
          <RedditPoster productId={productId} accountId={selectedAccountId} />
        </div>
      )}

      {currentStep === 'automation' && (
        <div>
          <div className="mb-6">
            <button
              onClick={handleBack}
              className="text-blue-600 hover:text-blue-800 flex items-center"
            >
              ← Back to Manual Posting
            </button>
          </div>
          <AutoPosterSettings productId={productId} accountId={selectedAccountId} />
        </div>
      )}
    </div>
  );
}

// Product Input Component
interface ProductInputProps {
  onSubmit: (data: {
    url: string;
    name: string;
    description: string;
    segments: string[];
  }) => void;
}

function ProductInput({ onSubmit }: ProductInputProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [segments, setSegments] = useState<string[]>(['']);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const addSegment = () => {
    setSegments([...segments, '']);
  };

  const updateSegment = (index: number, value: string) => {
    const newSegments = [...segments];
    newSegments[index] = value;
    setSegments(newSegments);
  };

  const removeSegment = (index: number) => {
    setSegments(segments.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validSegments = segments.filter(s => s.trim());
    onSubmit({ url, name, description, segments: validSegments });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-2xl font-bold mb-6">Enter Your Product Details</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product URL *
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourproduct.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome Product"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Description *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what your product does and who it's for..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Customer Segments
          </label>
          <div className="space-y-2">
            {segments.map((segment, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={segment}
                  onChange={(e) => updateSegment(index, e.target.value)}
                  placeholder="e.g., Small business owners, Developers, Students..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {segments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSegment(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addSegment}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              + Add another segment
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reddit Account for Posting
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            required
          >
            <option value="">Select Reddit Account</option>
            <option value="default">Default Account</option>
            {/* TODO: Load actual user accounts */}
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 font-medium"
          disabled={!selectedAccountId}
        >
          Start Customer Finding
        </button>
      </form>
    </div>
  );
}
