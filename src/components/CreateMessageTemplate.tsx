import { useState } from 'react';
import { createClientSupabaseClient } from '../utils/supabase';
import { RippleButton } from './ui/Button';
import { InfoCircleIcon } from './ui/Icons';

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  ai_prompt?: string;
}

interface CreateMessageTemplateProps {
  userId: string;
  onSuccess: () => void;
  existingTemplate?: MessageTemplate;
}

const supabase = createClientSupabaseClient();

export default function CreateMessageTemplate({
  userId,
  onSuccess,
  existingTemplate,
}: CreateMessageTemplateProps) {
  const [name, setName] = useState(existingTemplate?.name || '');
  const [content, setContent] = useState(existingTemplate?.content || '');
  const [aiPrompt, setAiPrompt] = useState(existingTemplate?.ai_prompt || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!existingTemplate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let endpoint = '/api/reddit/templates';
      let method = 'POST';
      let body: any = {
        name,
        content,
        ai_prompt: aiPrompt,
      };

      // If editing, include the template ID
      if (isEditing && existingTemplate) {
        body.id = existingTemplate.id;
        method = 'PUT'; // Use PUT for updates
      }

      // Use the server-side API endpoint instead of direct Supabase calls
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Server response error:', data);
        throw new Error(data.error || 'Failed to save template to database');
      }

      console.log(
        `Message template ${isEditing ? 'updated' : 'saved'} successfully!`
      );
      onSuccess();

      if (!isEditing) {
        // Only reset form if not editing
        setName('');
        setContent('');
        setAiPrompt('');
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 shadow sm:rounded-lg border border-gray-700">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-white">
          {isEditing ? 'Edit' : 'Create'} Message Template
        </h3>
        <div className="mt-2 max-w-xl text-sm text-gray-300">
          <p>Create a reusable message template for your Reddit outreach.</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-200"
            >
              Template Name
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="name"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                placeholder="e.g., Welcome Message"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-gray-200"
            >
              Message Content
            </label>
            <div className="mt-1">
              <textarea
                name="content"
                id="content"
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                placeholder="Enter your message template here. You can use variables like {username} and {subreddit}."
                required
              />
            </div>
            <p className="mt-2 text-sm text-gray-300">
              Available variables: {'{username}'}, {'{subreddit}'},{' '}
              {'{post_title}'}
            </p>
          </div>

          <div>
            <label
              htmlFor="aiPrompt"
              className="block text-sm font-medium text-gray-200"
            >
              AI Prompt for Post Relevance Check
              <span className="ml-1 inline-flex items-center">
                <InfoCircleIcon
                  className="h-4 w-4 text-gray-400"
                  tooltip="This prompt will be used by AI to determine if a post is relevant before sending a message."
                />
              </span>
            </label>
            <div className="mt-1">
              <textarea
                name="aiPrompt"
                id="aiPrompt"
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder-gray-400"
                placeholder="E.g., Check if the post is discussing an app, project, or website that the user has created or is promoting."
              />
            </div>
            <p className="mt-2 text-sm text-gray-300">
              The AI will use this prompt to analyze Reddit posts for relevance.
              Leave blank to use a default prompt.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-900/30 border border-red-800 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-400">Error</h3>
                  <div className="mt-2 text-sm text-red-300">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <RippleButton
              type="submit"
              disabled={isLoading}
              variant="primary"
              size="medium"
            >
              {isLoading
                ? isEditing
                  ? 'Saving...'
                  : 'Creating...'
                : isEditing
                  ? 'Save Changes'
                  : 'Create Template'}
            </RippleButton>
          </div>
        </form>
      </div>
    </div>
  );
}
