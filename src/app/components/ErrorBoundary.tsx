import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // You can also log the error to an error reporting service here
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return this.state.error ? (
        <div className="fixed inset-0 bg-red-50 dark:bg-red-900/50 flex items-center justify-center p-4 text-center">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Something went wrong
            </h2>
            <p className="text-red-500 dark:text-red-300 mb-4">
              {this.state.error.message}
            </p>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.location) {
                  window.location.reload();
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Reload Application
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 bg-red-50 dark:bg-red-900/50 flex items-center justify-center p-4 text-center">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Something went wrong
            </h2>
            <p className="text-red-500 dark:text-red-300 mb-4">
              An unexpected error occurred. Please reload the application.
            </p>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.location) {
                  window.location.reload();
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional component wrapper for easier usage
export function withErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  return <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>;
}