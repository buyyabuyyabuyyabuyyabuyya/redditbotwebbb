'use client';

import { useState, useEffect } from 'react';
import { ScrapedWebsiteData } from '../../types/beno-one';
import { DiscussionItem } from '../../types/beno-workflow';
import WebsiteInputForm from './WebsiteInputForm';
import DescriptionReview from './DescriptionReview';
import CustomerSegments from './CustomerSegments';
import CustomerFinding from './CustomerFinding';
import DiscussionsList from './DiscussionsList';
import SuccessScreen from './SuccessScreen';

interface WorkflowData {
  url: string;
  scrapedData: ScrapedWebsiteData;
  description: string;
  productId: string;
  discussions: DiscussionItem[];
  customerSegments: string[];
}

export default function BenoOneWorkflow() {
  const [currentStep, setCurrentStep] = useState(1);
  const [workflowData, setWorkflowData] = useState<WorkflowData>({
    url: '',
    scrapedData: {} as ScrapedWebsiteData,
    description: '',
    customerSegments: [],
    productId: '',
    discussions: []
  });
  const [isVisible, setIsVisible] = useState(false);

  // Listen for start workflow event
  useEffect(() => {
    const handleStartWorkflow = async (event: CustomEvent) => {
      const { url } = event.detail;
      setWorkflowData(prev => ({ ...prev, url }));
      setIsVisible(true);
      
      // Hide the URL input section
      const urlSection = document.querySelector('[id^="website-url"]')?.closest('.bg-gray-800\\/70');
      if (urlSection) {
        urlSection.classList.add('hidden');
      }
      
      // Show the workflow container
      const workflowContainer = document.getElementById('beno-workflow-container');
      if (workflowContainer) {
        workflowContainer.classList.remove('hidden');
      }
      
      // Automatically scrape the website and start the workflow
      try {
        const scrapedData = await describeProduct(url);
        handleWebsiteSubmitted(url, scrapedData);
      } catch (error) {
        console.error('Failed to scrape website:', error);
        // Still proceed with empty data to show error handling
        handleWebsiteSubmitted(url, {} as ScrapedWebsiteData);
      }
    };

    window.addEventListener('startBenoWorkflow', handleStartWorkflow as unknown as EventListener);
    
    return () => {
      window.removeEventListener('startBenoWorkflow', handleStartWorkflow as unknown as EventListener);
    };
  }, []);

  // Describe product via new Beno flow
  const describeProduct = async (url: string): Promise<ScrapedWebsiteData> => {
    try {
      const response = await fetch('/api/beno/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to describe product');
      // Map to legacy ScrapedWebsiteData-like shape used by UI components
      return {
        title: data.name,
        description: data.description,
      } as unknown as ScrapedWebsiteData;
    } catch (err) {
      console.error('describeProduct error:', err);
      throw err;
    }
  };

  const handleWebsiteSubmitted = (url: string, scrapedData: ScrapedWebsiteData) => {
    setWorkflowData(prev => ({
      ...prev,
      url,
      scrapedData
    }));
    setCurrentStep(2);
  };

  const handleDescriptionConfirmed = (description: string) => {
    setWorkflowData(prev => ({
      ...prev,
      description
    }));
    setCurrentStep(3);
  };

  const handleSegmentsSelected = (segments: string[]) => {
    setWorkflowData(prev => ({
      ...prev,
      customerSegments: segments
    }));
    setCurrentStep(4);
  };

  const handleCustomersFound = (productId: string, discussions: DiscussionItem[]) => {
    setWorkflowData(prev => ({ ...prev, productId, discussions }));
    setCurrentStep(5);
  };

  const handleRepliesPosted = () => {
    setCurrentStep(6);
  };

  const handleViewCustomers = () => {
    // TODO: Navigate to dashboard or results page
    console.log('Navigate to customers dashboard');
  };

  const handleStartOver = () => {
    setCurrentStep(1);
    setWorkflowData({
      url: '',
      scrapedData: {} as ScrapedWebsiteData,
      description: '',
      customerSegments: [],
      productId: '',
      discussions: []
    });
    
    // Show the URL input section again
    const urlSection = document.querySelector('[id^="website-url"]')?.closest('.bg-gray-800\\/70');
    if (urlSection) {
      urlSection.classList.remove('hidden');
    }
    
    // Hide the workflow container
    const workflowContainer = document.getElementById('beno-workflow-container');
    if (workflowContainer) {
      workflowContainer.classList.add('hidden');
    }
    
    setIsVisible(false);
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <WebsiteInputForm
            onWebsiteSubmitted={handleWebsiteSubmitted}
            onNext={() => {}} // Handled in handleWebsiteSubmitted
          />
        );
      
      case 2:
        return (
          <DescriptionReview
            scrapedData={workflowData.scrapedData}
            onDescriptionConfirmed={handleDescriptionConfirmed}
            onBack={goBack}
          />
        );
      
      case 3:
        return (
          <CustomerSegments
            onSegmentsSelected={handleSegmentsSelected}
            onBack={goBack}
          />
        );
      
      case 4:
        return (
          <CustomerFinding
            url={workflowData.url}
            description={workflowData.description}
            segments={workflowData.customerSegments}
            onCustomersFound={handleCustomersFound}
            onBack={goBack}
          />
        );
      
      case 5:
        return (
          <DiscussionsList
            productId={workflowData.productId}
            discussions={workflowData.discussions}
            onRepliesPosted={handleRepliesPosted}
            onBack={goBack}
          />
        );
      
      case 6:
        return (
          <SuccessScreen
            productName={workflowData.scrapedData.title || 'Your Product'}
            onViewCustomers={handleViewCustomers}
            onStartOver={handleStartOver}
          />
        );
      
      default:
        return (
          <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Something went wrong
              </h1>
              <button
                onClick={handleStartOver}
                className="px-6 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600"
              >
                Start Over
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="beno-one-workflow">
      {/* Progress Indicator */}
      {currentStep < 5 && (
        <div className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-500">
                  Step {currentStep} of 4
                </span>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`w-3 h-3 rounded-full ${
                        step <= currentStep ? 'bg-orange-500' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="text-sm text-gray-500">
                {currentStep === 1 && 'Enter Website'}
                {currentStep === 2 && 'Review Description'}
                {currentStep === 3 && 'Select Segments'}
                {currentStep === 4 && 'Finding Customers'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={currentStep < 5 ? 'pt-20' : ''}>
        {renderCurrentStep()}
      </div>
    </div>
  );
} 