import { useState, type FormEvent } from "react";
import { GraduationCap, KeyRound, LogOut, Settings, Trash } from "../lib/icons";
import { authApi, type Me } from "../lib/auth";
import {
  Button,
  Dialog,
  Field,
  Menu,
  MenuContent,
  MenuItem,
    MenuSeparator,
  MenuTrigger,
  notify,
  PasswordInput,
  Select,
  useConfirm,
} from "./ui";

type Section = "profile" | "password" | "danger";

export function AccountMenu({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [settings, setSettings] = useState<Section | null>(null);

  const signOut = async () => {
    try {
      await authApi.signOut();
      onSignedOut();
    } catch (err) {
      notify.error(err, "退出失败");
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            aria-label={`账号：${me.email}`}
            title={me.email}
            className="flex h-7 w-7 items-center justify-center rounded border border-line-strong bg-card text-xs font-medium text-ink transition-colors hover:bg-fill data-[state=open]:bg-fill"
          >
            {(me.email[0] ?? "?").toUpperCase()}
          </button>
        </MenuTrigger>
        <MenuContent className="w-60">
          <div className="px-2 pb-2 pt-1.5">
            <div className="truncate text-xs font-medium text-ink">{me.email}</div>
            <div className="mt-0.5 text-2xs text-sub">
              <span className="num">{me.enrollmentYear}</span> 级
            </div>
          </div>
          <MenuSeparator />
          <MenuItem icon={<GraduationCap />} onSelect={() => setSettings("profile")}>
            入学年份
          </MenuItem>
          <MenuItem icon={<KeyRound />} onSelect={() => setSettings("password")}>
            修改密码
          </MenuItem>
          <MenuItem icon={<Settings />} onSelect={() => setSettings("danger")}>
            账号与数据
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<LogOut />} onSelect={() => void signOut()}>
            退出登录
          </MenuItem>
        </MenuContent>
      </Menu>

      <AccountSettingsDialog
        me={me}
        section={settings}
        onSectionChange={setSettings}
        onSignedOut={onSignedOut}
      />
    </>
  );
}

function AccountSettingsDialog({
  me,
  section,
  onSectionChange,
  onSignedOut,
}: {
  me: Me;
  section: Section | null;
  onSectionChange: (s: Section | null) => void;
  onSignedOut: () => void;
}) {
  const confirm = useConfirm();
  const [year, setYear] = useState(String(me.enrollmentYear));
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    onSectionChange(null);
    setCurrent("");
    setNext("");
    setError(null);
    setYear(String(me.enrollmentYear));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => thisYear + 1 - i);
  if (!years.includes(me.enrollmentYear)) years.push(me.enrollmentYear);

  const saveYear = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await authApi.updateMe({ enrollmentYear: Number(year) });
      window.location.reload();
    });
  };

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await authApi.changePassword(current, next);
      notify.success("密码已修改", "其他设备上的登录已失效");
      close();
    });
  };

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await confirm({
      title: "永久注销账号？",
      description: "账号以及全部计划、成绩、课表会被立即删除，无法恢复。",
      tone: "danger",
      confirmLabel: "永久注销",
      requireText: me.email,
    });
    if (!ok) return;
    await run(async () => {
      await authApi.deleteAccount(current);
      onSignedOut();
    });
  };

  const titles: Record<Section, string> = {
    profile: "入学年份",
    password: "修改密码",
    danger: "账号与数据",
  };

  return (
    <Dialog
      open={section != null}
      onOpenChange={(open) => !open && close()}
      title={section ? titles[section] : ""}
      description={me.email}
      size="sm"
    >
      {section === "profile" && (
        <form onSubmit={saveYear} className="space-y-4">
          <Field label="入学年份" hint="第 1 学期 = 该年秋季；用于推算当前学期和课表。">
            <Select
              value={year}
              onChange={setYear}
              ariaLabel="入学年份"
              options={years.map((y) => ({ value: String(y), label: `${y} 级` }))}
            />
          </Field>
          {error && <p className="text-2xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={close}>
              取消
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={year === String(me.enrollmentYear)}>
              保存
            </Button>
          </div>
        </form>
      )}

      {section === "password" && (
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="当前密码">
            <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="新密码" hint="至少 8 位">
            <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          {error && <p className="text-2xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={close}>
              取消
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              修改密码
            </Button>
          </div>
        </form>
      )}

      {section === "danger" && (
        <form onSubmit={(e) => void deleteAccount(e)} className="space-y-4">
          <div className="rounded border border-line p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-danger">
              <Trash />
              注销账号
            </div>
            <p className="mt-1 text-2xs text-sub">
              永久删除账号及全部个人数据（计划、成绩、课表）。公共课程库不受影响。
            </p>
          </div>
          <Field label="输入当前密码以继续">
            <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          {error && <p className="text-2xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={close}>
              取消
            </Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!current}>
              注销账号…
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
