'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Dialog } from '@headlessui/react';
import CreateMessageTemplate from './CreateMessageTemplate';
import LogViewer from './LogViewer';
import UserStats from './UserStats';

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
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#111111] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <Dialog.Title className="text-lg font-semibold text-zinc-50">
              {title}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-50"
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
  const [templates, setTemplates] = useState<ReplyPlaybook[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [templateToEdit, setTemplateToEdit] = useState<ReplyPlaybook | null>(
    null
  );
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showEditTemplate, setShowEditTemplate] = useState(false);

  const loadTemplates = async () => {
    const response = await fetch('/api/reddit/templates');
    const data = await response.json();
    if (response.ok) setTemplates(data.templates || []);
  };

  useEffect(() => {
    if (!user) return;
    void loadTemplates();
  }, [user]);

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
        <section className="surface-card overflow-hidden">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-8">
              <p className="page-kicker">Dashboard</p>
              <h1 className="page-title mt-3">
                Managed network, playbooks, and campaign activity
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-500">
                The dashboard is for high-level control: review posting
                capacity, adjust reply playbooks, and jump into the discussion
                workspace when you want to operate campaigns. Posting account
                rotation is handled by the managed posting network.
              </p>
            </div>
            <div className="border-l border-black/8 bg-[#fafaf6] p-8">
              <div className="flex flex-wrap gap-3">
                <Link href="/discussion-poster" className="ui-button-primary">
                  Open discussion poster
                </Link>
                <Link href="/settings" className="ui-button-secondary">
                  Usage & billing
                </Link>
                <Link href="/file-logs" className="ui-button-secondary">
                  File logs
                </Link>
              </div>
              <div className="mt-6 text-sm leading-6 text-zinc-500">
                <p>Use Discussion Poster for campaign setup and execution.</p>
                <p className="mt-2">
                  Use this dashboard for usage, playbooks, and overall
                  visibility.
                </p>
              </div>
            </div>
          </div>
        </section>

        <UserStats userId={user.id} refreshTrigger={refreshTrigger} />

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="surface-card p-6">
            <h2 className="text-xl font-semibold text-zinc-950">
              Managed Posting Network
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Posting accounts, cooldowns, rotation, proxies, and credentials
              are operated by the platform. Your workspace only needs website
              configs, reply playbooks, and active auto-posters.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                ['Account setup', 'Handled by platform'],
                ['Rotation', 'Automatic'],
                ['User action', 'Configure website'],
              ].map(([label, value]) => (
                <div key={label} className="surface-subtle p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    {label}
                  </div>
                  <div className="mt-2 text-sm font-medium text-zinc-950">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card p-6">
            <h2 className="text-xl font-semibold text-zinc-950">
              Comment workflow
            </h2>
            <div className="mt-6 space-y-5 text-sm text-zinc-600">
              {[
                [
                  '01',
                  'Create a website config',
                  'Define audience, keywords, negative filters, and the subreddit list you actually want to target.',
                ],
                [
                  '02',
                  'Create a reply playbook',
                  'Set tone, promotion limits, and writing constraints so AI replies stay on-brand.',
                ],
                [
                  '03',
                  'Start the auto-poster',
                  'Launch the campaign and monitor output from the Discussion Poster workspace.',
                ],
              ].map(([step, title, desc]) => (
                <div key={title} className="flex gap-4">
                  <div className="h-8 w-8 rounded-full border border-black/10 bg-[#fafaf6] text-xs font-semibold leading-8 text-center text-zinc-700">
                    {step}
                  </div>
                  <div>
                    <div className="font-medium text-zinc-950">{title}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-500">
                      {desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/discussion-poster" className="ui-button-primary mt-6">
              Go to discussion poster
            </Link>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
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
            {templates.length === 0 ? (
              <div className="surface-subtle p-6 text-sm text-zinc-500">
                No reply playbooks yet.
              </div>
            ) : (
              <div className="divide-y divide-black/8">
                {templates.map((template) => (
                  <div key={template.id} className="py-4 first:pt-0 last:pb-0">
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
                ))}
              </div>
            )}
          </section>

          <section className="surface-card p-6">
            <h2 className="text-xl font-semibold text-zinc-950">
              Recent activity
            </h2>
            <div className="mt-4">
              <LogViewer userId={user.id} refreshTrigger={refreshTrigger} />
            </div>
          </section>
        </div>
      </div>

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
