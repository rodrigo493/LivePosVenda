import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface UnsavedChangesDialogProps {
  open: boolean;
  onSaveAndExit: () => void;
  onDiscardAndExit: () => void;
  onCancel: () => void;
  saving?: boolean;
}

/** Confirmação exibida ao tentar sair de um documento com alterações não salvas. */
export function UnsavedChangesDialog({
  open,
  onSaveAndExit,
  onDiscardAndExit,
  onCancel,
  saving = false,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
          <AlertDialogDescription>
            Você tem alterações não salvas neste documento. Tem certeza que deseja
            sair sem salvar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Continuar editando
          </Button>
          <Button variant="destructive" onClick={onDiscardAndExit} disabled={saving}>
            Sair sem salvar
          </Button>
          <Button onClick={onSaveAndExit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar e sair"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
