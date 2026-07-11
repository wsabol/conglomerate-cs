import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/form";
import { Spinner } from "../../components/state";
import { useAsync } from "../../lib/useAsync";
import { createInvite, listInvites } from "../../lib/admin";
import { ApiClientError } from "../../lib/api";
import type { InviteDTO } from "@shared/dto";
import styles from "../../routes/Admin.module.css";

export function InviteSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: invites, loading, reload } = useAsync(() => listInvites(), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createInvite({ name: name.trim(), email: email.trim() });
      setName("");
      setEmail("");
      setSuccess("Invite sent.");
      reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to send invite.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section}>
      <form className={styles.inviteForm} onSubmit={handleSubmit}>
        <TextField
          label="Name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex"
          required
        />
        <TextField
          label="Email address"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alex@example.com"
          autoComplete="email"
          required
        />
        {error && <p className={styles.formError}>{error}</p>}
        {success && <p className={styles.formSuccess}>{success}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send invite"}
        </Button>
      </form>

      {loading ? (
        <Spinner label="Loading invites" />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Invited by</th>
              <th>Sent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(invites?.results ?? []).map((invite: InviteDTO) => (
              <tr key={invite.id}>
                <td>{invite.inviteeName}</td>
                <td>{invite.email}</td>
                <td>{invite.invitedByEmail}</td>
                <td>{formatTimestamp(invite.createdOn)}</td>
                <td>{invite.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
