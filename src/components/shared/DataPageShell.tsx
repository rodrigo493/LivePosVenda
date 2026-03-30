import { motion } from "framer-motion";
import { LucideIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";

interface DataPageShellProps {
  title: string;
  description: string;
  icon: LucideIcon;
  addLabel?: string;
  columns: string[];
  data: Record<string, string | number>[];
}

export function DataPageShell({ title, description, icon, addLabel, columns, data }: DataPageShellProps) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        action={
          addLabel ? (
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </Button>
          ) : undefined
        }
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-card rounded-xl border shadow-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                {columns.map((col) => (
                  <th key={col} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer">
                  {columns.map((col) => (
                    <td key={col} className="px-4 py-3 text-sm">
                      {row[col] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
