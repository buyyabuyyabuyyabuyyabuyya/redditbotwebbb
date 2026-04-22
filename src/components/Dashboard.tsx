'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Dialog } from '@headlessui/react';
import AddRedditAccount from './AddRedditAccount';
import CreateMessageTemplate from './CreateMessageTemplate';
import LogViewer from './LogViewer';
import UserStats from './UserStats';

interface RedditAccount {
  id: string;
  username: string;
  is_validated: boolean | null;
  status?: string;
}

interface CommentTemplate {
  id: string;
  name: string;
  content: string;
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <Dialog.Title className="text-lg font-semibold text-white">
              {title}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="max-h-[calc(90vh-64px)] overflow-y-auto p-4">
            {children}
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const [accounts, setAccounts] = useState<RedditAccount[]>([]);
  const [templates, setTemplates] = useState<CommentTemplate[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [accountToEdit, setAccountToEdit] = useState<any | null>(null);
  const [templateToEdit, setTemplateToEdit] = useState<CommentTemplate | null>(
    null
  );
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showEditTemplate, setShowEditTemplate] = useState(false);

  const loadAccounts = async () => {
    const response = await fetch('/api/reddit/account');
    const data = await response.json();
    if (response.ok) setAccounts(data.accounts || []);
  };

  const loadTemplates = async () => {
    const response = await fetch('/api/reddit/templates');
    const data = await response.json();
    if (response.ok) setTemplates(data.templates || []);
  };

  useEffect(() => {
    if (!user) return;
    void loadAccounts();
    void loadTemplates();
  }, [user]);

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Delete this Reddit account?')) return;
    const response = await fetch(`/api/reddit/account?id=${accountId}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      await loadAccounts();
      setRefreshTrigger((value) => value + 1);
    }
  };

  const handleEditAccount = async (accountId: string) => {
    const response = await fetch(
      `/api/reddit/account?id=${accountId}&credentials=true`
    );
    const data = await response.json();
    if (response.ok) {
      setAccountToEdit(data.account);
      setShowEditAccount(true);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Delete this comment template?')) return;
    const response = await fetch(`/api/reddit/templates?id=${templateId}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      await loadTemplates();
      setRefreshTrigger((value) => value + 1);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="rounded-2xl border border-gray-700 bg-gray-900/80 p-6 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Comment Outreach Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-gray-300">
              Manage Reddit accounts, comment templates, website targeting
              configs, and auto-poster activity from one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/discussion-poster"
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Open Comment Workspace
            </Link>
            <Link
              href="/file-logs"
              className="rounded-lg border border-gray-600 px-4 py-2 font-medium text-gray-200 hover:bg-gray-800"
            >
              View File Logs
            </Link>
            <Link
              href="/settings"
              className="rounded-lg border border-gray-600 px-4 py-2 font-medium text-gray-200 hover:bg-gray-800"
            >
              Usage & Billing
            </Link>
          </div>
        </div>
      </div>

      <UserStats userId={user.id} refreshTrigger={refreshTrigger} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-700 bg-gray-800/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Reddit Accounts
                </h2>
                <p className="text-sm text-gray-400">
                  Accounts used for replies and auto-posting.
                </p>
              </div>
              <button
                onClick={() => setShowAddAccount(true)}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                Add Account
              </button>
            </div>
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-600 p-6 text-sm text-gray-400">
                  No Reddit accounts added yet.
                </div>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-col gap-3 rounded-xl border border-gray-700 bg-gray-900/60 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium text-white">
                        u/{account.username}
                      </div>
                      <div className="text-sm text-gray-400">
                        {account.status ||
                          (account.is_validated
                            ? 'Validated'
                            : 'Needs validation')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditAccount(account.id)}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account.id)}
                        className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-700 bg-gray-800/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Comment Templates
                </h2>
                <p className="text-sm text-gray-400">
                  Reusable drafts for manual replies and campaign ideas.
                </p>
              </div>
              <button
                onClick={() => setShowCreateTemplate(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Create Template
              </button>
            </div>
            <div className="space-y-3">
              {templates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-600 p-6 text-sm text-gray-400">
                  No comment templates yet.
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-xl border border-gray-700 bg-gray-900/60 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-white">
                          {template.name}
                        </h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">
                          {template.content}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setTemplateToEdit(template);
                            setShowEditTemplate(true);
                          }}
                          className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-700 bg-gray-800/70 p-6">
            <h2 className="text-xl font-semibold text-white">
              Comment Workflow
            </h2>
            <div className="mt-4 space-y-3 text-sm text-gray-300">
              <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                <div className="font-medium text-white">
                  1. Create a website config
                </div>
                <p className="mt-1 text-gray-400">
                  Define customer segments, target keywords, and negative
                  filters for relevance scoring.
                </p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                <div className="font-medium text-white">
                  2. Review relevant discussions
                </div>
                <p className="mt-1 text-gray-400">
                  Use the comment workspace to inspect AI-ranked Reddit posts
                  before replying.
                </p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                <div className="font-medium text-white">
                  3. Run the auto-poster
                </div>
                <p className="mt-1 text-gray-400">
                  Launch server-driven auto-posters and monitor their status
                  without keeping a tab open.
                </p>
              </div>
            </div>
            <Link
              href="/discussion-poster"
              className="mt-5 inline-flex rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Go to Discussion Poster
            </Link>
          </section>

          <section className="rounded-2xl border border-gray-700 bg-gray-800/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Recent Activity
              </h2>
            </div>
            <LogViewer userId={user.id} refreshTrigger={refreshTrigger} />
          </section>
        </div>
      </div>

      <Modal
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        title="Add Reddit Account"
      >
        <AddRedditAccount
          userId={user.id}
          onSuccess={() => {
            setShowAddAccount(false);
            void loadAccounts();
            setRefreshTrigger((value) => value + 1);
          }}
        />
      </Modal>

      <Modal
        open={showEditAccount}
        onClose={() => setShowEditAccount(false)}
        title="Edit Reddit Account"
      >
        {accountToEdit && (
          <AddRedditAccount
            userId={user.id}
            account={accountToEdit}
            onSuccess={() => {
              setShowEditAccount(false);
              setAccountToEdit(null);
              void loadAccounts();
              setRefreshTrigger((value) => value + 1);
            }}
          />
        )}
      </Modal>

      <Modal
        open={showCreateTemplate}
        onClose={() => setShowCreateTemplate(false)}
        title="Create Comment Template"
      >
        <CreateMessageTemplate
          userId={user.id}
          onSuccess={() => {
            setShowCreateTemplate(false);
            void loadTemplates();
            setRefreshTrigger((value) => value + 1);
          }}
        />
      </Modal>

      <Modal
        open={showEditTemplate}
        onClose={() => setShowEditTemplate(false)}
        title="Edit Comment Template"
      >
        {templateToEdit && (
          <CreateMessageTemplate
            userId={user.id}
            existingTemplate={templateToEdit}
            onSuccess={() => {
              setShowEditTemplate(false);
              setTemplateToEdit(null);
              void loadTemplates();
              setRefreshTrigger((value) => value + 1);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
