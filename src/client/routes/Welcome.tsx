import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buttonClass } from "../components/ui/Button";
import { Spinner } from "../components/state";
import { verifyInviteToken } from "../lib/admin";
import { ApiClientError } from "../lib/api";
import styles from "./Welcome.module.css";

export default function Welcome() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [inviteeName, setInviteeName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setError("This invite link is missing a token.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    verifyInviteToken(token)
      .then((res) => {
        if (!cancelled) setInviteeName(res.inviteeName ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "This invite link is invalid or has expired.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <p className={styles.brand}>The Conglomerate</p>
        {loading ? (
          <Spinner label="Verifying invite" />
        ) : error ? (
          <>
            <p className={styles.tagline}>{error}</p>
            <Link className={buttonClass("primary", "md", true)} to="/signin">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <p className={styles.tagline}>
              Hi {inviteeName}, you've been invited to explore our private band archive.
            </p>
            <Link className={buttonClass("primary", "md", true)} to="/">
              Continue
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
