import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { TextField } from "../components/form";
import styles from "./SignIn.module.css";

// Access performs the actual authentication (Google / email OTP). This page is
// the branded entry point; it is fully wired to the Access login URL in
// Milestone 4. Access is invite-only - there is no sign-up.
export default function SignIn() {
  const [email, setEmail] = useState("");

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div>
          <p className={styles.brand}>The Conglomerate</p>
          <p className={styles.tagline}>A private archive. Sign in to continue.</p>
        </div>

        <Button variant="ghost" block>
          <Icon name="external" size={18} /> Continue with Google
        </Button>

        <div className={styles.divider}>or</div>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <TextField
            label="Email address"
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" block>
            Email me a one-time PIN
          </Button>
        </form>

        <p className={styles.note}>
          Access is invite-only. Your email must be on the allowlist.
        </p>
      </div>
    </div>
  );
}
