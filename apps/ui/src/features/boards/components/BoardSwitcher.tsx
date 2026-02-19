import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronDown, LayoutDashboard, Pencil, Plus } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  OverflowList,
  OverflowListContent,
  OverflowListIndicator,
  OverflowListItem,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useOverflowList,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import type { BoardSummary } from '../api';
import { useBoards, useCreateBoard, useReorderBoards } from '../hooks';
import { BoardFormFields } from './BoardFormFields';
import { IconPicker } from './IconPicker';

// ─── Tab content (shared between sortable tab & drag overlay) ────────────────

interface TabContentProps {
  board: BoardSummary;
  isDragging?: boolean;
}

function TabContent({ board, isDragging }: Readonly<TabContentProps>) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap rounded-md py-1.5 pr-7 pl-3 text-sm',
        isDragging && 'bg-background shadow-sm'
      )}
    >
      {board.icon ? (
        <DynamicIcon name={board.icon as IconName} className="size-3.5" />
      ) : (
        <LayoutDashboard className="size-3.5" />
      )}
      {board.name}
    </div>
  );
}

// ─── Sortable Tab ────────────────────────────────────────────────────────────

interface SortableTabProps {
  board: BoardSummary;
  onEdit: (board: BoardSummary) => void;
  activeId: string | null;
}

function SortableTab({ board, onEdit, activeId }: Readonly<SortableTabProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: board.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative shrink-0"
      {...attributes}
      {...listeners}
    >
      {/* Render plain TabContent during drag to avoid navigation on drop */}
      {activeId ? (
        <TabContent board={board} />
      ) : (
        <Link
          to="/boards/$boardId"
          params={{ boardId: board.id }}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-md py-1.5 pr-7 pl-3 text-sm transition-colors"
          activeProps={{ className: 'bg-background font-medium shadow-sm' }}
          inactiveProps={{ className: 'text-muted-foreground hover:text-foreground' }}
        >
          {board.icon ? (
            <DynamicIcon name={board.icon as IconName} className="size-3.5" />
          ) : (
            <LayoutDashboard className="size-3.5" />
          )}
          {board.name}
        </Link>
      )}
      {!activeId && (
        <button
          type="button"
          onClick={() => onEdit(board)}
          className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
        >
          <Pencil className="size-2.5" />
        </button>
      )}
    </div>
  );
}

// ─── Board icon helper ───────────────────────────────────────────────────────

function BoardIcon({ icon }: { icon?: string }) {
  return icon ? (
    <DynamicIcon name={icon as IconName} className="size-3.5" />
  ) : (
    <LayoutDashboard className="size-3.5" />
  );
}

// ─── Board Switcher ──────────────────────────────────────────────────────────

interface BoardSwitcherProps {
  onEdit: (board: BoardSummary) => void;
}

const getKey = (d: BoardSummary) => d.id;

export function BoardSwitcher({ onEdit }: Readonly<BoardSwitcherProps>) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { boardId } = useParams({ strict: false });
  const { data: boards = [] } = useBoards();
  const { mutate: reorderBoards } = useReorderBoards();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const { mutate: createBoard, isPending: creating } = useCreateBoard();
  const [activeId, setActiveId] = useState<string | null>(null);

  // ─── Overflow detection (via reusable hook) ────────────────────────────

  const { containerRef, visible, overflow, hasOverflow, pauseRef } = useOverflowList({
    items: boards,
    getKey,
    activeKey: boardId,
    deps: [activeId],
  });

  // ─── Drag-to-reorder ──────────────────────────────────────────────────

  const tabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeDrag = activeId ? boards.find((d) => d.id === activeId) : undefined;

  const handleDragStart = (event: DragStartEvent) => {
    pauseRef.current = true;
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    pauseRef.current = false;
    setActiveId(null);

    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = boards.findIndex((d) => d.id === active.id);
      const newIndex = boards.findIndex((d) => d.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        const reordered = arrayMove(boards, oldIndex, newIndex);
        reorderBoards(reordered.map((d) => d.id));
      }
    }
  };

  const handleDragCancel = () => {
    pauseRef.current = false;
    setActiveId(null);
  };

  // ─── Create dialog ────────────────────────────────────────────────────

  const handleCreate = () => {
    if (!newName.trim()) return;
    createBoard(
      { name: newName.trim(), icon: newIcon.trim() },
      {
        onSuccess: (board) => {
          setCreateOpen(false);
          setNewName('');
          setNewIcon('');
          navigate({ to: '/boards/$boardId', params: { boardId: board.id } });
        },
      }
    );
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (open) {
      setNewName('');
      setNewIcon('');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <OverflowList className="rounded-lg bg-muted/50 p-1">
        <OverflowListContent ref={containerRef}>
          <DndContext
            sensors={tabSensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={visible.map((d) => d.id)}
              strategy={horizontalListSortingStrategy}
            >
              {visible.map((d) => (
                <OverflowListItem key={d.id} itemId={d.id}>
                  <SortableTab board={d} onEdit={onEdit} activeId={activeId} />
                </OverflowListItem>
              ))}
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeDrag ? <TabContent board={activeDrag} isDragging /> : null}
            </DragOverlay>
          </DndContext>
        </OverflowListContent>

        {/* Indicator always occupies space for stable layout */}
        <OverflowListIndicator active={hasOverflow}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-0.5 px-1.5 text-muted-foreground"
              >
                <span className="font-medium text-[10px]">
                  +{hasOverflow ? overflow.length : 1}
                </span>
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            {hasOverflow && (
              <DropdownMenuContent align="start">
                {overflow.map((d) => (
                  <DropdownMenuItem
                    key={d.id}
                    className="group/item flex items-center justify-between gap-3"
                    onClick={() =>
                      navigate({
                        to: '/boards/$boardId',
                        params: { boardId: d.id },
                      })
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      <BoardIcon icon={d.icon} />
                      <span className={cn(d.id === boardId && 'font-medium')}>{d.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(d);
                      }}
                      className="flex size-5 items-center justify-center rounded opacity-0 hover:bg-accent group-hover/item:opacity-100"
                    >
                      <Pencil className="size-2.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        </OverflowListIndicator>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Create new board */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => handleCreateOpenChange(true)}
            >
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('boards:board.new')}</TooltipContent>
        </Tooltip>
      </OverflowList>

      {/* ─── Create dialog ─────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('boards:board.new')}</DialogTitle>
            <DialogDescription>{t('boards:board.newDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <BoardFormFields
              name={newName}
              icon={newIcon}
              onNameChange={setNewName}
              onSubmit={handleCreate}
              inputId="create-board-name"
            />

            <Separator />

            <IconPicker value={newIcon} onChange={setNewIcon} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? t('common:messages.loading') : t('common:actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
