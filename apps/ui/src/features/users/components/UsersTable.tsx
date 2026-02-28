import { useState } from 'react';
import { KeyRound, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@brika/auth/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { UserRecord } from '../api';
import { UserRoleBadge } from './UserRoleBadge';
import { EditUserDialog } from './EditUserDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { DeleteUserDialog } from './DeleteUserDialog';
import { UserAvatar } from '@/components/user-avatar';

interface UsersTableProps {
  users: UserRecord[];
  isLoading: boolean;
}

export function UsersTable({ users, isLoading }: Readonly<UsersTableProps>) {
  const { t, formatDate } = useLocale();
  const { user: currentUser } = useAuth();

  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {['s1', 's2', 's3'].map((id) => (
            <Skeleton key={id} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">{t('users:noUsers')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users:fields.name')}</TableHead>
              <TableHead>{t('users:fields.email')}</TableHead>
              <TableHead>{t('users:fields.role')}</TableHead>
              <TableHead>{t('users:fields.status')}</TableHead>
              <TableHead>{t('users:fields.createdAt')}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelf = currentUser?.id === user.id;
              const canDelete = !isSelf && user.role !== 'admin';

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar user={user} size="sm" />
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <UserRoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'secondary' : 'outline'}>
                      {t(`users:status.${user.isActive ? 'active' : 'inactive'}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(new Date(user.createdAt))}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteUser(user)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="size-8 p-0">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditUser(user)}>
                            <Pencil className="size-4" />
                            {t('users:editUser')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResetUser(user)}>
                            <KeyRound className="size-4" />
                            {t('users:resetPassword')}
                          </DropdownMenuItem>
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteUser(user)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="size-4" />
                                {t('users:deleteUser')}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {editUser && (
        <EditUserDialog
          open={!!editUser}
          onOpenChange={(open) => { if (!open) setEditUser(null); }}
          user={editUser}
        />
      )}

      {resetUser && (
        <ResetPasswordDialog
          open={!!resetUser}
          onOpenChange={(open) => { if (!open) setResetUser(null); }}
          userId={resetUser.id}
          userName={resetUser.name}
        />
      )}

      {deleteUser && (
        <DeleteUserDialog
          open={!!deleteUser}
          onOpenChange={(open) => { if (!open) setDeleteUser(null); }}
          userId={deleteUser.id}
          userName={deleteUser.name}
        />
      )}
    </>
  );
}
