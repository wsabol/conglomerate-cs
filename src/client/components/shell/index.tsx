import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "../../lib/cn";
import { useAuth } from "../../lib/auth";
import { Icon } from "../ui/Icon";
import styles from "./shell.module.css";

interface NavItem {
  to: string;
  label: string;
  editorOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/timeline", label: "Timeline" },
  { to: "/performances", label: "Performances" },
  { to: "/media", label: "Media" },
  { to: "/admin", label: "Admin", editorOnly: true },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const { isEditor, user } = useAuth();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  const items = NAV_ITEMS.filter((i) => !i.editorOnly || isEditor);

  return (
    <header className={styles.navbar}>
      <div className={styles.navInner}>
        <Link to="/" >
          <span className={styles.brandInitial}>the</span>
          <span className={styles.brand}>conglomerate</span>
        </Link>

        <nav className={styles.links} aria-label="Primary">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(styles.link, isActive && styles.linkActive)
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.spacer}>
          {user && (
            <span className={styles.user} title={user.email}>
              {user.displayName ?? user.email}
              {isEditor && <span className={styles.roleBadge}>Editor</span>}
            </span>
          )}
          <button
            type="button"
            className={styles.hamburger}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>

      {open && (
        <div className={styles.mobileMenu} id="mobile-menu">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(styles.mobileLink, isActive && styles.mobileLinkActive)
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span className={styles.footerLeft}>the conglomerate archives · private</span>
        <span className={styles.footerRight}>
          est. 2010 · college station, tx
        </span>
      </div>
    </footer>
  );
}

export function AppShell() {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
