import { Eye, PencilLine } from "lucide-react";
import { useEditMode } from "../lib/editMode";
import { cn } from "../lib/cn";
import { notify } from "./ui";

/** 查看 / 编辑模式切换。查看模式锁定拖拽、删除和编辑，适合手机浏览。 */
export function EditModeToggle() {
  const { editing, setEditing } = useEditMode();
  const set = (next: boolean) => {
    if (next === editing) return;
    setEditing(next);
    notify.info(next ? "已进入编辑模式" : "已切换到查看模式", next ? "可以拖拽、添加和修改课程" : "拖拽、删除和编辑已锁定");
  };
  const item = (active: boolean) =>
    cn(
      "inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
      active ? "bg-card font-medium text-ink shadow-[0_0_0_1px_rgb(var(--line-strong))]" : "text-sub hover:text-ink",
    );
  return (
    <div role="radiogroup" aria-label="模式" className="inline-flex h-7 items-center rounded bg-fill-strong p-0.5">
      <button type="button" role="radio" aria-checked={!editing} onClick={() => set(false)} className={item(!editing)} title="查看模式：锁定拖拽和编辑">
        <Eye />
        <span className="hidden sm:inline">查看</span>
      </button>
      <button type="button" role="radio" aria-checked={editing} onClick={() => set(true)} className={item(editing)} title="编辑模式：可拖拽、添加和修改">
        <PencilLine />
        <span className="hidden sm:inline">编辑</span>
      </button>
    </div>
  );
}
