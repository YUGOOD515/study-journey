import { createContext, useCallback, useContext, useEffect, useState } from "react";

const KEY = "study-journey-edit-mode";

interface EditModeValue {
  /** true = 编辑模式（可拖拽、增删改）；false = 查看模式（只读，防误触） */
  editing: boolean;
  setEditing: (value: boolean) => void;
  toggle: () => void;
}

const EditModeContext = createContext<EditModeValue>({ editing: true, setEditing: () => {}, toggle: () => {} });

function initial(): boolean {
  const stored = window.localStorage.getItem(KEY);
  if (stored === "edit") return true;
  if (stored === "view") return false;
  // 默认：桌面编辑，手机查看（避免滑动时误拖拽）
  return !window.matchMedia("(max-width: 639px)").matches;
}

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditingState] = useState(initial);

  useEffect(() => {
    document.documentElement.dataset.mode = editing ? "edit" : "view";
  }, [editing]);

  const setEditing = useCallback((value: boolean) => {
    setEditingState(value);
    window.localStorage.setItem(KEY, value ? "edit" : "view");
  }, []);
  const toggle = useCallback(() => setEditing(!editing), [editing, setEditing]);

  return <EditModeContext.Provider value={{ editing, setEditing, toggle }}>{children}</EditModeContext.Provider>;
}

export const useEditMode = () => useContext(EditModeContext);
