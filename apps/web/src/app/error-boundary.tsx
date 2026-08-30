import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface BoundaryState { failed: boolean; }
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  public override state: BoundaryState = { failed: false };
  public static getDerivedStateFromError(): BoundaryState { return { failed: true }; }
  public override componentDidCatch(_error: Error, _info: ErrorInfo): void { void _error; void _info; }
  public override render(): ReactNode { return this.state.failed ? <main className="page"><h1>Something went wrong</h1><p>Try returning to a safe page or refresh the browser.</p><Link className="button" to="/">Go home</Link></main> : this.props.children; }
}
