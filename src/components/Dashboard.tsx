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

interface ReplyPlaybook {
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
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-black/8 px-5 py-4">
            <Dialog.Title className="text-lg font-semibold text-zinc-950">
              {title}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950"
            >
              ✕
            </button>
          </div>
          <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5">
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
  const [templates, setTemplates] = useState<ReplyPlaybook[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [accountToEdit, setAccountToEdit] = useState<any | null>(null);
  const [templateToEdit, setTemplateToEdit] = useState<ReplyPlaybook | null>(
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
    if (!confirm('Delete this reply playbook?')) return;
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
    <div className="section-shell py-12">
      <div className="space-y-8">
        <section className="surface-card p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="page-kicker">Dashboard</p>
              <h1 className="page-title mt-3">
                A cleaner workspace for accounts, playbooks, and campaign
                activity
              </h1>
              <p className="mt-4 text-sm leading-6 text-zinc-500">
                Manage the pieces that power your comment campaigns: Reddit
                accounts, reply playbooks, website configs, auto-posters, and
                the latest system activity.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/discussion-poster" className="ui-button-primary">
                Open discussion poster
              </Link>
              <Link href="/settings" className="ui-button-secondary">
                Usage & billing
              </Link>
            </div>
          </div>
        </section>

        <UserStats userId={user.id} refreshTrigger={refreshTrigger} />

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="surface-card p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-950">
                    Reddit accounts
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Accounts used for replies and auto-posting.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddAccount(true)}
                  className="ui-button-primary"
                >
                  Add account
                </button>
              </div>
              <div className="space-y-3">
                {accounts.length === 0 ? (
                  <div className="surface-subtle p-6 text-sm text-zinc-500">
                    No Reddit accounts added yet.
                  </div>
                ) : (
                  accounts.map((account) => (
                    <div
                      key={account.id}
                      className="surface-subtle flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="font-medium text-zinc-950">
                          u/{account.username}
                        </div>
                        <div className="mt-1 text-sm text-zinc-500">
                          {account.status ||
                            (account.is_validated
                              ? 'Validated'
                              : 'Needs validation')}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditAccount(account.id)}
                          className="ui-button-secondary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="ui-button-danger"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="surface-card p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-950">
                    Reply playbooks
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Instruction sets that shape how AI writes and what it should
                    avoid.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateTemplate(true)}
                  className="ui-button-primary"
                >
                  Create playbook
                </button>
              </div>
              <div className="space-y-3">
                {templates.length === 0 ? (
                  <div className="surface-subtle p-6 text-sm text-zinc-500">
                    No reply playbooks yet.
                  </div>
                ) : (
                  templates.map((template) => (
                    <div key={template.id} className="surface-subtle p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-zinc-950">
                            {template.name}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                            {template.content}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTemplateToEdit(template);
                              setShowEditTemplate(true);
                            }}
                            className="ui-button-secondary"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="ui-button-danger"
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
            <section className="surface-card p-6">
              <h2 className="text-xl font-semibold text-zinc-950">
                Comment workflow
              </h2>
              <div className="mt-5 space-y-3 text-sm text-zinc-600">
                {[
                  [
                    'Create a website config',
                    'Define audience, keywords, negative filters, and the subreddit list you actually want to target.',
                  ],
                  [
                    'Create a reply playbook',
                    'Set tone, promotion limits, and writing constraints so AI replies stay on-brand.',
                  ],
                  [
                    'Start the auto-poster',
                    'Launch the campaign and monitor output from the Discussion Poster workspace.',
                  ],
                ].map(([title, desc]) => (
                  <div key={title} className="surface-subtle p-4">
                    <div className="font-medium text-zinc-950">{title}</div>
                    <div className="mt-1 text-sm text-zinc-500">{desc}</div>
                  </div>
                ))}
              </div>
              <Link
                href="/discussion-poster"
                className="ui-button-primary mt-5"
              >
                Go to discussion poster
              </Link>
            </section>

            <section className="surface-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-950">
                  Recent activity
                </h2>
              </div>
              <LogViewer userId={user.id} refreshTrigger={refreshTrigger} />
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        title="Add Reddit account"
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
        title="Edit Reddit account"
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
        title="Create reply playbook"
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
        title="Edit reply playbook"
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
