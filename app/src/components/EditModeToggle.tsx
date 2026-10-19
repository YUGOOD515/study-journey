import { Eye, PencilLine } from "lucide-react";
import { useEditMode } from "../lib/editMode";
import { cn } from "../lib/cn";
import { notify } from "./ui";

/** 编辑 / 查看模式切换。查看模式下锁定拖拽、删除和编辑，适合手机浏览。 */
export function EditModeToggle({ compact = false }: { compact?: boolean }) {
  const { editing, setEditing } = useEditMode();
  const toggle = () => {
    const next = !editing;
    setEditing(next);
    notify.info(next ? "已进入编辑模式" : "已切换到查看模式", next ? "可以拖拽、添加和修改课程" : "拖拽、删除和编辑已锁定");
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editing}
      title={editing ? "当前：编辑模式（点击切换到查看）" : "当前：查看模式（点击切换到编辑）"}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors",
        editing
          ? "border-brand/35 bg-brand/10 text-brand hover:bg-brand/15"
          : "border-sub/20 bg-card text-sub hover:border-sub/40 hover:text-ink"
      )}
    >
      {editing ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {!compact && <span>{editing ? "编辑中" : "查看中"}</span>}
      {compact && <span className="sr-only">{editing ? "编辑模式" : "查看模式"}</span>}
    </button>
  );
}
