import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '../utils/supabase';
import { useUserPlan } from '../hooks/useUserPlan';
import { Button3D } from './ui/Button';

const supabase = createClientSupabaseClient();

interface SendMessageProps {
  userId: string;
  onSuccess: () => void;
}

interface RedditAccount {
  id: string;
  username: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

export default function SendMessage({ userId, onSuccess }: SendMessageProps) {
  const [recipientUsername, setRecipientUsername] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<RedditAccount[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  // Fetch accounts and templates on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Reddit accounts
        const { data: accountsData } = await supabase
          .from('reddit_accounts')
          .select('id, username')
          .eq('user_id', userId)
          .eq('is_validated', true);

        if (accountsData) {
          setAccounts(accountsData);
        }

        // Fetch message templates
        const { data: templatesData } = await supabase
          .from('message_templates')
          .select('id, name, content')
          .eq('user_id', userId);

        if (templatesData) {
          setTemplates(templatesData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    };

    fetchData();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Get the selected template content if a template is selected
      let messageContent = customMessage;
      if (selectedTemplate) {
        const template = templates.find((t) => t.id === selectedTemplate);
        if (template) {
          messageContent = template.content;
        }
      }

      // Send the message
      const response = await fetch('/api/reddit/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientUsername,
          accountId: selectedAccount,
          message: messageContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Record the sent message in Supabase
      const { error: dbError } = await supabaseAdmin
        .from('sent_messages')
        .insert([
          {
            user_id: userId,
            recipient_username: recipientUsername,
            content: messageContent,
            reddit_account_id: selectedAccount,
          },
        ]);

      if (dbError) {
        throw dbError;
      }

      onSuccess();
      setRecipientUsername('');
      setCustomMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 shadow sm:rounded-lg border border-gray-700">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-white">
          Send Message
        </h3>
        <div className="mt-2 max-w-xl text-sm text-gray-300">
          <p>Send a message to a Reddit user using one of your accounts.</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="recipient"
              className="block text-sm font-medium text-gray-200"
            >
              Recipient Username
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="recipient"
                id="recipient"
                value={recipientUsername}
                onChange={(e) => setRecipientUsername(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="u/username"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="account"
              className="block text-sm font-medium text-gray-700"
            >
              Send From Account
            </label>
            <div className="mt-1">
              <select
                id="account"
                name="account"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                required
              >
                <option value="">Select an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    u/{account.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="template"
              className="block text-sm font-medium text-gray-700"
            >
              Message Template
            </label>
            <div className="mt-1">
              <select
                id="template"
                name="template"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">Custom Message</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="message"
              className="block text-sm font-medium text-gray-200"
            >
              Message
            </label>
            <div className="mt-1">
              <textarea
                name="message"
                id="message"
                rows={4}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Enter your message here..."
                required={!selectedTemplate}
                disabled={!!selectedTemplate}
              />
            </div>
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
            <Button3D
              type="submit"
              disabled={isLoading}
              variant="primary"
              size="medium"
            >
              {isLoading ? 'Sending...' : 'Send Message'}
            </Button3D>
          </div>
        </form>
      </div>
    </div>
  );
}
