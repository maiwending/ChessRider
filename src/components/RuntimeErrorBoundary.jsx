import React from 'react';

export default class RuntimeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, info);
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="runtime-error" role="alert">
        <h2>Something went wrong</h2>
        <p className="muted">
          A runtime error interrupted this view. You can retry or reload the page.
        </p>
        <div className="runtime-error__actions">
          <button className="btn btn-primary" onClick={this.handleReset}>
            Retry View
          </button>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
      </section>
    );
  }
}
