import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { RegionDialog } from './RegionDialog';
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
import { useRegions, useDeleteRegion } from '@/hooks/useRegions';
import { useAuth } from '@/contexts/AuthContext';
import type { Region } from '@/types/database';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function RegionsTable() {
  const { data: regions = [], isLoading } = useRegions();
  const deleteRegion = useDeleteRegion();
  const { isPromaster } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [regionToDelete, setRegionToDelete] = useState<Region | null>(null);

  const handleEdit = (region: Region) => {
    setSelectedRegion(region);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedRegion(null);
    setDialogOpen(true);
  };

  const handleDeleteClick = (region: Region) => {
    setRegionToDelete(region);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!regionToDelete) return;

    try {
      await deleteRegion.mutateAsync(regionToDelete.id);
      toast.success('Region deleted successfully');
      setDeleteDialogOpen(false);
      setRegionToDelete(null);
    } catch (error) {
      toast.error('Failed to delete region');
      console.error(error);
    }
  };

  const columns: ColumnDef<Region>[] = [
    {
      accessorKey: 'region_code',
      header: 'Region Code',
      cell: ({ row }) => (
        <div className="font-medium uppercase">{row.getValue('region_code')}</div>
      ),
    },
    {
      accessorKey: 'region_name',
      header: 'Region Name',
      cell: ({ row }) => {
        const name = row.getValue('region_name') as string | null;
        return (
          <div className="text-sm">
            {name || <span className="text-muted-foreground">—</span>}
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
        const region = row.original;

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
              <DropdownMenuItem onClick={() => handleEdit(region)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteClick(region)}
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
        <div className="text-muted-foreground">Loading regions...</div>
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={regions}
        searchColumn="region_code"
        searchPlaceholder="Search regions..."
        onAdd={isPromaster ? handleAdd : undefined}
        addLabel="Add Region"
        showAdd={isPromaster}
      />

      <RegionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        region={selectedRegion}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the region "{regionToDelete?.region_code}".
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
