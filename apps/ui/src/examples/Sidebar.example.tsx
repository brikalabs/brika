/**
 * Example: Using routes object in navigation
 * Shows how to build navigation links from routes
 */

import { Link } from '@tanstack/react-router';
import { useCanAccess } from '@brika/auth/react';
import { routes } from '@/router';

export function Sidebar() {
  // ✅ Check permissions from routes object
  const canViewWorkflows = useCanAccess(routes.workflows.list.scopes);
  const canViewPlugins = useCanAccess(routes.plugins.list.scopes);
  const canViewStore = useCanAccess(routes.store.list.scopes);
  const canViewLogs = useCanAccess(routes.logs.list.scopes);

  return (
    <nav className="w-64 bg-gray-100 p-4 h-screen">
      <h1 className="font-bold mb-6">Brika</h1>

      <div className="space-y-2">
        {/* Dashboard - always visible */}
        <Link
          to={routes.dashboard.index.path}
          className="block px-4 py-2 rounded hover:bg-gray-200"
        >
          Dashboard
        </Link>

        {/* Workflows - conditional */}
        {canViewWorkflows && (
          <Link
            to={routes.workflows.list.path}
            className="block px-4 py-2 rounded hover:bg-gray-200"
          >
            Workflows
          </Link>
        )}

        {/* Plugins - conditional */}
        {canViewPlugins && (
          <Link
            to={routes.plugins.list.path}
            className="block px-4 py-2 rounded hover:bg-gray-200"
          >
            Plugins
          </Link>
        )}

        {/* Store - conditional */}
        {canViewStore && (
          <Link
            to={routes.store.list.path}
            className="block px-4 py-2 rounded hover:bg-gray-200"
          >
            Store
          </Link>
        )}

        {/* Logs - admin only */}
        {canViewLogs && (
          <Link
            to={routes.logs.list.path}
            className="block px-4 py-2 rounded hover:bg-gray-200"
          >
            Logs
          </Link>
        )}

        {/* Settings - always visible */}
        <Link
          to={routes.settings.index.path}
          className="block px-4 py-2 rounded hover:bg-gray-200"
        >
          Settings
        </Link>
      </div>
    </nav>
  );
}
