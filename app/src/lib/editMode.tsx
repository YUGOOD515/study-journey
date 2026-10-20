import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface EditModeValue {
  /** true = 编辑模式（可拖拽、增删改）；false = 查看模式（只读，防误触） */
  editing: boolean;
  setEditing: (value: boolean) => void;
  toggle: () => void;
}

const EditModeContext = createContext<EditModeValue>({ editing: false, setEditing: () => {}, toggle: () => {} });

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditingState] = useState(false); // 每次打开默认查看模式（只读），需要时手动切到编辑

  useEffect(() => {
    document.documentElement.dataset.mode = editing ? "edit" : "view";
  }, [editing]);

  const setEditing = useCallback((value: boolean) => setEditingState(value), []);
  const toggle = useCallback(() => setEditing(!editing), [editing, setEditing]);

  return <EditModeContext.Provider value={{ editing, setEditing, toggle }}>{children}</EditModeContext.Provider>;
}

export const useEditMode = () => useContext(EditModeContext);
