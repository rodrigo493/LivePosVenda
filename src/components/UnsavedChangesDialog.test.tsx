import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

describe("UnsavedChangesDialog", () => {
  it("não renderiza conteúdo quando open=false", () => {
    render(
      <UnsavedChangesDialog
        open={false}
        onSaveAndExit={vi.fn()}
        onDiscardAndExit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Alterações não salvas")).toBeNull();
  });

  it("dispara onSaveAndExit ao clicar 'Salvar e sair'", () => {
    const onSave = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        onSaveAndExit={onSave}
        onDiscardAndExit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar e sair" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("dispara onDiscardAndExit ao clicar 'Sair sem salvar'", () => {
    const onDiscard = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        onSaveAndExit={vi.fn()}
        onDiscardAndExit={onDiscard}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("dispara onCancel ao clicar 'Continuar editando'", () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        onSaveAndExit={vi.fn()}
        onDiscardAndExit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
