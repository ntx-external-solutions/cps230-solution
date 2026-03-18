import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { CriticalOperationDialog } from './CriticalOperationDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useCriticalOperations, useDeleteCriticalOperation } from '@/hooks/useCriticalOperations';
import { useAuth } from '@/contexts/AuthContext';
import type { CriticalOperation } from '@/types/database';
import { toast } from 'sonner';

export function CriticalOperationsTable() {
  const { data: operations = [], isLoading } = useCriticalOperations();
  const deleteOperation = useDeleteCriticalOperation();
  const { isPromaster } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<CriticalOperation | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [operationToDelete, setOperationToDelete] = useState<CriticalOperation | null>(null);

  const handleEdit = (operation: CriticalOperation) => {
    setSelectedOperation(operation);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedOperation(null);
    setDialogOpen(true);
  };

  const handleDeleteClick = (operation: CriticalOperation) => {
    setOperationToDelete(operation);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!operationToDelete) return;

    try {
      await deleteOperation.mutateAsync(operationToDelete.id);
      toast.success('Critical operation deleted successfully');
      setDeleteDialogOpen(false);
      setOperationToDelete(null);
    } catch (error) {
      toast.error('Failed to delete critical operation');
      console.error(error);
    }
  };

  const columns: ColumnDef<CriticalOperation>[] = [
    {
      accessorKey: 'operation_name',
      header: 'Operation Name',
      cell: ({ row }) => {
        const colorCode = row.original.color_code;
        return (
          <div className="flex items-center gap-2">
            {colorCode && (
              <div
                className="w-3 h-3 rounded-full border"
                style={{ backgroundColor: colorCode }}
              />
            )}
            <span className="font-medium">{row.getValue('operation_name')}</span>
          </div>
        );
      },
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
      id: 'system',
      header: 'System',
      cell: ({ row }) => {
        const systemName = (row.original as any).system_name;
        return (
          <div className="text-sm">
            {systemName ? (
              <Badge variant="outline">{systemName}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'process',
      header: 'Process',
      cell: ({ row }) => {
        const processName = (row.original as any).process_name;
        return (
          <div className="text-sm">
            {processName ? (
              <Badge variant="outline">{processName}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const operation = row.original;

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
              <DropdownMenuItem onClick={() => handleEdit(operation)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteClick(operation)}
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
        <div className="text-muted-foreground">Loading critical operations...</div>
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={operations}
        searchColumn="operation_name"
        searchPlaceholder="Search critical operations..."
        onAdd={isPromaster ? handleAdd : undefined}
        addLabel="Add Critical Operation"
        showAdd={isPromaster}
      />

      <CriticalOperationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        operation={selectedOperation}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the critical operation "
              {operationToDelete?.operation_name}". This action cannot be undone.
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
