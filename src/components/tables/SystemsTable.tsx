import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { SystemDialog } from './SystemDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useSystems, useDeleteSystem } from '@/hooks/useSystems';
import { useAuth } from '@/contexts/AuthContext';
import type { System } from '@/types/database';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function SystemsTable() {
  const { data: systems = [], isLoading } = useSystems();
  const deleteSystem = useDeleteSystem();
  const { isPromaster } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<System | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [systemToDelete, setSystemToDelete] = useState<System | null>(null);

  const handleEdit = (system: System) => {
    setSelectedSystem(system);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedSystem(null);
    setDialogOpen(true);
  };

  const handleDeleteClick = (system: System) => {
    setSystemToDelete(system);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!systemToDelete) return;

    try {
      await deleteSystem.mutateAsync(systemToDelete.id);
      toast.success('System deleted successfully');
      setDeleteDialogOpen(false);
      setSystemToDelete(null);
    } catch (error) {
      toast.error('Failed to delete system');
      console.error(error);
    }
  };

  const columns: ColumnDef<System>[] = [
    {
      accessorKey: 'system_name',
      header: 'System Name',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('system_name')}</div>
      ),
    },
    {
      accessorKey: 'system_id',
      header: 'System ID',
      cell: ({ row }) => (
        <div className="text-muted-foreground text-sm">
          {row.getValue('system_id')}
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const description = row.getValue('description') as string | null;
        return (
          <div className="text-sm max-w-md truncate">
            {description || <span className="text-muted-foreground">—</span>}
          </div>
        );
      },
    },
    {
      accessorKey: 'modified_date',
      header: 'Last Modified',
      cell: ({ row }) => {
        const date = row.getValue('modified_date') as string;
        return (
          <div className="text-sm text-muted-foreground">
            {format(new Date(date), 'MMM d, yyyy')}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const system = row.original;

        if (!isPromaster) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(system)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteClick(system)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading systems...</div>
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={systems}
        searchColumn="system_name"
        searchPlaceholder="Search systems..."
        onAdd={isPromaster ? handleAdd : undefined}
        addLabel="Add System"
        showAdd={isPromaster}
      />

      <SystemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        system={selectedSystem}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the system "{systemToDelete?.system_name}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
