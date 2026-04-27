// src/components/crm/FunnelManagerDropdown.tsx
import { useState } from "react";
import { Settings, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FunnelDialog } from "@/components/crm/FunnelDialog";
import { UserAccessDialog } from "@/components/crm/UserAccessDialog";
import type { Pipeline } from "@/hooks/usePipelines";

interface FunnelManagerDropdownProps {
  currentPipeline: Pipeline | null;
  onPipelineCreated: (pipeline: Pipeline) => void;
}

export function FunnelManagerDropdown({ currentPipeline, onPipelineCreated }: FunnelManagerDropdownProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Editar funil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Criar funil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAccessOpen(true)}>
            <Users className="h-4 w-4 mr-2" /> Acesso de usuários
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FunnelDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        pipeline={currentPipeline}
      />

      <FunnelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onCreated={(p) => {
          setCreateOpen(false);
          onPipelineCreated(p);
        }}
      />

      <UserAccessDialog open={accessOpen} onOpenChange={setAccessOpen} />
    </>
  );
}
