'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-zinc-900 p-8 shadow-lg">
            <div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-zinc-50">
                Something went wrong
              </h2>
              <p className="mt-2 text-center text-sm text-zinc-400">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>
            <div className="mt-8 space-y-6">
              <button
                onClick={() => window.location.reload()}
                className="flex w-full justify-center rounded-xl border border-transparent bg-[#7c6cff] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#6b5af0] focus:outline-none focus:ring-2 focus:ring-[#7c6cff] focus:ring-offset-2 focus:ring-offset-zinc-950"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
