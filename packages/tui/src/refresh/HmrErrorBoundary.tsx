/**
 * React error boundary for HMR. Catches render/commit errors before
 * they tear down the Ink root, pushes them to the HMR error store,
 * and renders nothing in their place (the sibling `<HmrErrorOverlay />`
 * shows the message from the store).
 *
 * Required because errors in Ink's host config (e.g. a bare string
 * outside `<Text>` throwing in `createTextInstance`) bubble out of
 * React's commit phase. Without a boundary, React unmounts the
 * entire root — losing the overlay along with the broken tree.
 *
 * Resets its local `hasError` flag when the error store transitions
 * back to `null` (i.e. the next successful reload). That re-renders
 * `props.children` with the FIXED component code in the fiber type
 * slot — Fast Refresh's swap is already in place by then.
 */

import { Component, type ReactNode } from 'react';
import { getHmrError, setHmrError, subscribeHmrError } from './error-store';

interface State {
  hasError: boolean;
}

export class HmrErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false };
  private unsub: (() => void) | null = null;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error): void {
    setHmrError({
      file: '<render>',
      message: error.message,
      stack: error.stack,
      at: Date.now(),
    });
  }

  override componentDidMount(): void {
    this.unsub = subscribeHmrError(() => {
      if (!getHmrError() && this.state.hasError) {
        this.setState({ hasError: false });
      }
    });
  }

  override componentWillUnmount(): void {
    this.unsub?.();
  }

  override render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
