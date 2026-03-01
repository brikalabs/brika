/**
 * Example: Using routes object in a component
 * Shows how to use routes for navigation and permission checks
 */

import { useCanAccess } from '@brika/auth/react';
import { useNavigate } from '@tanstack/react-router';
import { routes } from '@/router';

interface WorkflowCardProps {
  workflow: {
    id: string;
    name: string;
    status: 'active' | 'paused' | 'error';
  };
}

export function WorkflowCard({ workflow }: Readonly<WorkflowCardProps>) {
  const navigate = useNavigate();
  const canEdit = useCanAccess(routes.workflows.edit.scopes);
  const canRead = useCanAccess(routes.workflows.list.scopes);

  // If user can't read workflows, don't show this card
  if (!canRead) {
    return null;
  }

  const handleEdit = () => {
    // ✅ Navigate using routes object
    navigate({
      to: routes.workflows.edit.path,
      params: {
        id: workflow.id,
      },
    });
  };

  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-bold">{workflow.name}</h3>
      <p className="text-gray-500 text-sm">{workflow.status}</p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleEdit}
          disabled={!canEdit}
          className="rounded bg-blue-500 px-3 py-1 text-white disabled:opacity-50"
        >
          {canEdit ? 'Edit' : 'View Only'}
        </button>

        {canEdit && <button className="rounded bg-red-500 px-3 py-1 text-white">Delete</button>}
      </div>
    </div>
  );
}
