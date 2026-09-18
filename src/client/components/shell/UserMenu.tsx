import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { useAuth } from "../../lib/auth";
import { Icon } from "../ui/Icon";
import styles from "./shell.module.css";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const label = user.instrument?.trim() || "Member";

  return (
    <div className={styles.userMenuRoot} ref={rootRef}>
      <button
        type="button"
        className={styles.userToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="user" size={16} />
        <span className={styles.userToggleName}>{user.displayName ?? user.email}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn(styles.userToggleChevron, open && styles.userToggleChevronOpen)}
        />
      </button>

      {open && (
        <div className={styles.userDropdown} role="menu">
          <div className={styles.userDropdownHeader}>
            <span className={styles.userDropdownInstrument}>{label}</span>
            <span className={styles.userDropdownEmail}>{user.email}</span>
          </div>
          <div className={styles.userDropdownDivider} />
          {logoutError && <span role="alert">{logoutError}</span>}
          <button
            type="button"
            className={styles.userDropdownAction}
            role="menuitem"
            onClick={() => {
              setLogoutError(null);
              void logout().catch(() => setLogoutError("Could not sign out. Please try again."));
            }}
          >
            <Icon name="log-out" size={16} />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
