import { useState } from "react";
import { Link } from "react-router-dom";
import { Container } from "../components/layout";
import { PageHeader } from "../components/ui/PageHeader";
import { Pill } from "../components/ui/Pill";
import { Select } from "../components/form";
import { Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { listUsers, listRevisions, setUserRole, setUserDisabled } from "../lib/admin";
import { InviteSection } from "../components/admin/InviteSection";
import { REVISION_TARGET_TYPES, type RevisionTargetType, type UserRole } from "@shared/types";
import styles from "./Admin.module.css";

type Tab = "users" | "history" | "invites";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");
  const [targetType, setTargetType] = useState<RevisionTargetType | "">("");

  const { data: users, loading: usersLoading, reload: reloadUsers } = useAsync(
    () => listUsers(),
    [],
  );

  const revisionQuery = targetType ? { target_type: targetType } : {};
  const { data: revisions, loading: revLoading } = useAsync(
    () => listRevisions(revisionQuery),
    [targetType],
  );

  async function handleSetUserRole(id: number, role: UserRole) {
    await setUserRole(id, role);
    reloadUsers();
  }

  async function toggleDisabled(user: { id: number; isDeleted: boolean }) {
    await setUserDisabled(user.id, !user.isDeleted);
    reloadUsers();
  }

  return (
    <Container>
      <PageHeader
        eyebrow="Editors only"
        title="Admin"
        subtitle="User management, invites, and change history."
      />

      <div className={styles.tabs}>
        <Pill active={tab === "users"} onClick={() => setTab("users")}>
          Users
        </Pill>
        <Pill active={tab === "history"} onClick={() => setTab("history")}>
          Change history
        </Pill>
        <Pill active={tab === "invites"} onClick={() => setTab("invites")}>
          Invites
        </Pill>
      </div>

      {tab === "users" && (
        <section className={styles.section}>
          {usersLoading ? (
            <Spinner label="Loading users" />
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(users?.results ?? []).map((u) => (
                  <tr key={u.id} className={u.isDeleted ? styles.disabled : ""}>
                    <td>{u.email}</td>
                    <td>
                      <Select
                        label="Role"
                        value={u.role}
                        onChange={(e) =>
                          handleSetUserRole(u.id, e.target.value as UserRole)
                        }
                        options={[
                          { value: "member", label: "Member" },
                          { value: "editor", label: "Editor" },
                        ]}
                      />
                    </td>
                    <td>{u.isDeleted ? "Disabled" : "Active"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => toggleDisabled(u)}
                      >
                        {u.isDeleted ? "Enable" : "Disable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className={styles.hint}>
            Manage events from the{" "}
            <Link to="/events/new">new event form</Link> or any event page.
          </p>
        </section>
      )}

      {tab === "invites" && <InviteSection />}

      {tab === "history" && (
        <section className={styles.section}>
          <Select
            label="Filter by type"
            value={targetType}
            onChange={(e) =>
              setTargetType(e.target.value as RevisionTargetType | "")
            }
            options={[
              { value: "", label: "All types" },
              ...REVISION_TARGET_TYPES.map((t) => ({ value: t, label: t })),
            ]}
          />
          {revLoading ? (
            <Spinner label="Loading history" />
          ) : (
            <ul className={styles.revisions}>
              {(revisions?.results ?? []).map((r) => (
                <li key={r.id} className={styles.revision}>
                  <span className={styles.revMeta}>
                    {r.changedAt} · {r.action} · {r.targetType} #{r.targetId}
                    {r.changedByEmail ? ` · ${r.changedByEmail}` : ""}
                  </span>
                  {(r.beforeJson || r.afterJson) && (
                    <details>
                      <summary>View diff</summary>
                      {r.beforeJson && (
                        <pre className={styles.json}>Before: {r.beforeJson}</pre>
                      )}
                      {r.afterJson && (
                        <pre className={styles.json}>After: {r.afterJson}</pre>
                      )}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Container>
  );
}
