/**
 * Sidebar is an app-shell component — it consumes a SidebarProvider context
 * that wraps the whole app surface. A live preview inside a doc card is
 * misleading: in real use the sidebar fills the viewport edge.
 *
 * Show a static screenshot-style preview here. The full doc page in
 * apps/ui demonstrates the actual integration.
 */
export function SidebarDefaultDemo() {
  return (
    <div className="flex w-full max-w-md overflow-hidden rounded-lg border border-clay-hairline">
      <div className="flex w-44 flex-col gap-2 border-clay-hairline border-r bg-clay-canvas p-3">
        <p className="font-medium font-mono text-[0.625rem] text-clay-subtle uppercase tracking-wider">
          Workspace
        </p>
        <ul className="space-y-0.5 text-clay-default text-sm">
          <li className="rounded bg-clay-control px-2 py-1 font-medium text-clay-strong">
            Dashboard
          </li>
          <li className="px-2 py-1">Plugins</li>
          <li className="px-2 py-1">Settings</li>
        </ul>
      </div>
      <div className="flex-1 bg-clay-elevated p-4 text-clay-subtle text-sm">Main content</div>
    </div>
  );
}
