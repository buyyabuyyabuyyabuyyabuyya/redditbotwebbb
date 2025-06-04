'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  FaInbox,
  FaPaperPlane,
  FaEnvelope,
  FaReply,
  FaFilter,
  FaSearch,
} from 'react-icons/fa';

interface RedditAccount {
  id: string;
  username: string;
  user_id: string;
}

interface Message {
  id: string;
  subject: string;
  body: string;
  author: string;
  created_utc: number;
  isIncoming: boolean; // true for received, false for sent
  wasRead: boolean;
}

interface MessageInboxProps {
  accounts: RedditAccount[];
  userId: string;
}

export default function MessageInbox({ accounts, userId }: MessageInboxProps) {
  const [selectedAccount, setSelectedAccount] = useState<RedditAccount | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<'all' | 'received' | 'sent'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [messageLimit, setMessageLimit] = useState<number>(100); // Default to 100 messages

  // Load messages when account changes
  useEffect(() => {
    if (selectedAccount) {
      fetchMessages(selectedAccount);
    }
  }, [selectedAccount]);

  const [error, setError] = useState<string | null>(null);

  const fetchMessages = async (account: RedditAccount) => {
    setLoading(true);
    setError(null);
    setMessages([]);

    try {
      // Show a loading message
      console.log(
        `Fetching messages for Reddit account: ${account.username}...`
      );

      // Fetch messages from the private-messages endpoint with the specified limit
      const response = await fetch(
        `/api/reddit/private-messages?accountId=${account.id}&limit=${messageLimit}`
      );

      const data = await response.json();

      if (!response.ok) {
        // Handle API error response
        const errorMessage = data.error || 'Failed to fetch messages';
        const details = data.details ? `: ${data.details}` : '';
        throw new Error(`${errorMessage}${details}`);
      }

      if (data.messages && Array.isArray(data.messages)) {
        setMessages(data.messages);
        console.log(`Retrieved ${data.messages.length} messages`);
      } else {
        setMessages([]);
        console.log('No messages found or invalid format returned');
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to fetch messages from Reddit'
      );
    } finally {
      setLoading(false);
    }
  };

  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const handleSendReply = async (messageId: string) => {
    if (!selectedAccount || !replyMessage.trim()) return;

    setSendingReply(true);
    setReplyError(null);

    try {
      // Call the API to send the reply
      console.log(
        `Sending reply to message ${messageId} from account ${selectedAccount.username}`
      );

      const response = await fetch('/api/reddit/private-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: selectedAccount.id,
          messageId,
          body: replyMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle API error response
        const errorMessage = data.error || 'Failed to send reply';
        const details = data.details ? `: ${data.details}` : '';
        throw new Error(`${errorMessage}${details}`);
      }

      // Success - clear form and refresh messages
      setReplyingTo(null);
      setReplyMessage('');

      // Refresh the messages to show the new reply
      setTimeout(() => fetchMessages(selectedAccount), 1000);
    } catch (error) {
      console.error('Error sending reply:', error);
      setReplyError(
        error instanceof Error
          ? error.message
          : 'Failed to send reply. Please try again.'
      );
    } finally {
      setSendingReply(false);
    }
  };

  const filteredMessages = messages.filter((message) => {
    // Apply filter (all, received, sent)
    if (filter === 'received' && !message.isIncoming) return false;
    if (filter === 'sent' && message.isIncoming) return false;

    // Apply search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        message.subject.toLowerCase().includes(term) ||
        message.body.toLowerCase().includes(term) ||
        message.author.toLowerCase().includes(term)
      );
    }

    return true;
  });

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  if (accounts.length === 0) {
    return (
      <div className="text-center py-8">
        <FaInbox className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          No Reddit accounts
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You need to add a Reddit account before you can view messages.
        </p>
        <div className="mt-6">
          <a
            href="/dashboard"
            className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Add Reddit Account
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Account Selector */}
      <div className="mb-6">
        <label
          htmlFor="account-select"
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Select Reddit Account
        </label>
        <select
          id="account-select"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-gray-700 text-white"
          value={selectedAccount?.id || ''}
          onChange={(e) => {
            const account = accounts.find((a) => a.id === e.target.value);
            setSelectedAccount(account || null);
          }}
        >
          <option value="">Select an account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.username}
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center h-40">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-6 py-1">
              <div className="h-2 bg-gray-700 rounded"></div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="h-2 bg-gray-700 rounded col-span-2"></div>
                  <div className="h-2 bg-gray-700 rounded col-span-1"></div>
                </div>
                <div className="h-2 bg-gray-700 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages List with Filters */}
      {selectedAccount && !loading && (
        <>
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 space-y-2 md:space-y-0">
            <div className="flex space-x-2">
              <button
                className={`px-3 py-1 rounded-md text-sm ${filter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                onClick={() => setFilter('all')}
              >
                <FaInbox className="inline mr-2" /> All
              </button>
              <button
                className={`px-3 py-1 rounded-md text-sm ${filter === 'received' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                onClick={() => setFilter('received')}
              >
                <FaEnvelope className="inline mr-2" /> Received
              </button>
              <button
                className={`px-3 py-1 rounded-md text-sm ${filter === 'sent' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                onClick={() => setFilter('sent')}
              >
                <FaPaperPlane className="inline mr-2" /> Sent
              </button>
              <select
                className="ml-4 bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-1"
                value={messageLimit}
                onChange={(e) => {
                  const newLimit = parseInt(e.target.value);
                  setMessageLimit(newLimit);
                  if (selectedAccount) {
                    fetchMessages(selectedAccount);
                  }
                }}
              >
                <option value="50">50 messages</option>
                <option value="100">100 messages</option>
                <option value="200">200 messages</option>
                <option value="500">500 messages</option>
                <option value="1000">1000 messages</option>
              </select>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaSearch className="text-gray-400" />
              </div>
              <input
                type="text"
                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                placeholder="Search messages..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {error ? (
            <div className="text-center py-8 bg-red-900/30 rounded-lg border border-red-700/50 p-4">
              <FaEnvelope className="mx-auto h-8 w-8 text-red-400 mb-2" />
              <p className="text-white font-medium">Error loading messages</p>
              <p className="text-gray-300 mt-1">{error}</p>
              <button
                onClick={() =>
                  selectedAccount && fetchMessages(selectedAccount)
                }
                className="mt-4 bg-purple-600 hover:bg-purple-700 text-white rounded-md px-4 py-2 text-sm inline-flex items-center"
              >
                Try Again
              </button>
            </div>
          ) : filteredMessages.length > 0 ? (
            <div className="space-y-4">
              {filteredMessages.map((message) => (
                <div
                  key={message.id}
                  className={`bg-gray-800 rounded-lg p-4 border ${
                    message.isIncoming
                      ? message.wasRead
                        ? 'border-gray-700'
                        : 'border-purple-500'
                      : 'border-blue-500'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-white">
                        {message.subject}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {message.isIncoming ? 'From' : 'To'}: {message.author} •{' '}
                        {formatDate(message.created_utc)}
                      </p>
                    </div>
                    {message.isIncoming && (
                      <button
                        className="bg-purple-600 hover:bg-purple-700 text-white rounded-md px-3 py-1 text-sm flex items-center"
                        onClick={() => setReplyingTo(message.id)}
                        disabled={sendingReply}
                      >
                        <FaReply className="mr-1" /> Reply
                      </button>
                    )}
                  </div>
                  <div className="mt-2 text-gray-300 whitespace-pre-wrap">
                    {message.body}
                  </div>

                  {/* Reply Form */}
                  {replyingTo === message.id && (
                    <div className="mt-4 border-t border-gray-700 pt-4">
                      {replyError && (
                        <div className="mb-3 text-red-400 text-sm bg-red-900/30 p-2 rounded border border-red-700/50">
                          {replyError}
                        </div>
                      )}
                      <textarea
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
                        rows={4}
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your reply here..."
                        disabled={sendingReply}
                      ></textarea>
                      <div className="mt-2 flex justify-end space-x-2">
                        <button
                          className="bg-gray-600 hover:bg-gray-700 text-white rounded-md px-3 py-1 text-sm"
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyMessage('');
                            setReplyError(null);
                          }}
                          disabled={sendingReply}
                        >
                          Cancel
                        </button>
                        <button
                          className="bg-purple-600 hover:bg-purple-700 text-white rounded-md px-3 py-1 text-sm flex items-center"
                          onClick={() => handleSendReply(message.id)}
                          disabled={sendingReply || !replyMessage.trim()}
                        >
                          {sendingReply ? (
                            <>
                              <svg
                                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                              Sending...
                            </>
                          ) : (
                            <>
                              <FaReply className="mr-1" /> Send Reply
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">No messages found</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
