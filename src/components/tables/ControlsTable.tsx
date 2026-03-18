import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { ControlDialog } from './ControlDialog';
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
import { useControls, useDeleteControl } from '@/hooks/useControls';
import { useAuth } from '@/contexts/AuthContext';
import type { Control } from '@/types/database';
import { toast } from 'sonner';

export function ControlsTable() {
  const { data: controls = [], isLoading } = useControls();
  const deleteControl = useDeleteControl();
  const { isPromaster } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [controlToDelete, setControlToDelete] = useState<Control | null>(null);

  const handleEdit = (control: Control) => {
    setSelectedControl(control);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedControl(null);
    setDialogOpen(true);
  };

  const handleDeleteClick = (control: Control) => {
    setControlToDelete(control);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!controlToDelete) return;

    try {
      await deleteControl.mutateAsync(controlToDelete.id);
      toast.success('Control deleted successfully');
      setDeleteDialogOpen(false);
      setControlToDelete(null);
    } catch (error) {
      toast.error('Failed to delete control');
      console.error(error);
    }
  };

  const columns: ColumnDef<Control>[] = [
    {
      accessorKey: 'control_name',
      header: 'Control Name',
      cell: ({ row }) => {
        const colorCode = (row.original as any).color_code;
        return (
          <div className="flex items-center gap-2">
            {colorCode && (
              <div
                className="w-3 h-3 rounded-full border"
                style={{ backgroundColor: colorCode }}
              />
            )}
            <span className="font-medium">{row.getValue('control_name')}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'control_type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('control_type') as string | null;
        return (
          <div className="text-sm">
            {type ? (
              <Badge variant="secondary">{type}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'critical_operation',
      header: 'Critical Operation',
      cell: ({ row }) => {
        const operation = (row.original as any).critical_operation;
        return (
          <div className="text-sm">
            {operation?.operation_name ? (
              <Badge variant="outline">{operation.operation_name}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'regions',
      header: 'Regions',
      cell: ({ row }) => {
        const regions = row.getValue('regions') as string[] | null;
        return (
          <div className="flex gap-1 flex-wrap">
            {regions && regions.length > 0 ? (
              regions.map((region) => (
                <Badge key={region} variant="outline" className="text-xs">
                  {region}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
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
      id: 'actions',
      cell: ({ row }) => {
        const control = row.original;

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
              <DropdownMenuItem onClick={() => handleEdit(control)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteClick(control)}
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
        <div className="text-muted-foreground">Loading controls...</div>
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={controls}
        searchColumn="control_name"
        searchPlaceholder="Search controls..."
        onAdd={isPromaster ? handleAdd : undefined}
        addLabel="Add Control"
        showAdd={isPromaster}
      />

      <ControlDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        control={selectedControl}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the control "{controlToDelete?.control_name}".
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
