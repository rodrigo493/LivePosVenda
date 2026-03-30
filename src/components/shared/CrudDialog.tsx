import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface FormField {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "date" | "select" | "textarea";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  onCreateNew?: () => void;
}

export interface CrudDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: FormField[];
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  footer?: React.ReactNode;
}

const EMPTY_INITIAL_VALUES: Record<string, any> = {};

export function CrudDialog({ open, onOpenChange, title, fields, initialValues, onSubmit, footer }: CrudDialogProps) {
  const resolvedInitialValues = initialValues ?? EMPTY_INITIAL_VALUES;
  const [values, setValues] = useState<Record<string, any>>(resolvedInitialValues);
  const [loading, setLoading] = useState(false);

  // Sync values when initialValues or open state changes
  useEffect(() => {
    if (open) {
      setValues(resolvedInitialValues);
    }
  }, [open, resolvedInitialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(values);
      toast.success("Salvo com sucesso!");
      onOpenChange(false);
      setValues({});
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  };

  const updateValue = (name: string, value: any) => setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-xs">{field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}</Label>
              {field.type === "select" ? (
                <div className="flex gap-1.5">
                  <Select value={values[field.name] || ""} onValueChange={(v) => updateValue(field.name, v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.onCreateNew && (
                    <Button type="button" variant="outline" size="icon" className="shrink-0 h-10 w-10" onClick={field.onCreateNew} title={`Criar novo ${field.label}`}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : field.type === "textarea" ? (
                <Textarea
                  value={values[field.name] || ""}
                  onChange={(e) => updateValue(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              ) : (
                <Input
                  type={field.type || "text"}
                  value={values[field.name] ?? ""}
                  onChange={(e) => updateValue(field.name, field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  step={field.type === "number" ? "any" : undefined}
                />
              )}
            </div>
          ))}
          {footer && <div className="border-t pt-4 mt-2">{footer}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
