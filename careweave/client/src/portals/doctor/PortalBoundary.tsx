import { Component, type ReactNode } from 'react'

// A render failure inside the doctor portal shows a message instead of a blank page.
export default class PortalBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="max-w-lg border border-alert bg-surface p-6 text-sm text-ink">
        <h1 className="text-lg font-semibold text-alert">This screen could not load</h1>
        <p className="mt-2 text-ink-2">
          A screen received data it did not expect. This usually means the server does not provide the doctor
          endpoints this portal calls (patient record, encounters, prescriptions, reconciliation).
        </p>
      </div>
    )
  }
}
