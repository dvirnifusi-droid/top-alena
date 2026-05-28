import React from 'react';

/**
 * Catches render errors in a subtree so a single broken page/widget
 * doesn't blank the entire app. Shows a small recoverable error card.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label || '', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="m-6 p-6 bg-red-50 border border-red-200 rounded-2xl max-w-2xl">
          <h2 className="text-lg font-bold text-red-700 mb-2">⚠️ שגיאה בטעינת העמוד</h2>
          <p className="text-sm text-red-600 mb-4">
            רכיב בעמוד הזה נכשל, אבל שאר המערכת עובדת. אפשר לנסות שוב או לעבור לעמוד אחר.
          </p>
          <pre className="text-xs bg-white/70 p-3 rounded overflow-auto max-h-40 text-slate-700">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={this.reset}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 px-4 rounded-xl"
          >
            נסה שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
