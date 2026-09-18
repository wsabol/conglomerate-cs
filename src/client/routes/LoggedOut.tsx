import { Link } from "react-router-dom";
import { buttonClass } from "../components/ui/Button";
import styles from "./Welcome.module.css";

export default function LoggedOut() {
  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img className={styles.logo} src="/ico/logo-transparent.png" alt="" width={96} height={96} />
        </div>
        <h1 className={styles.brand}>You're signed out</h1>
        <div className={styles.instructions}>
          <p className={styles.tagline}>But not tuned out.</p>
          <p className={styles.tagline}>Go forth and improve your funkmenship</p>
          <p className={styles.tagline}>And may we all find Funk after Death.</p>
        </div>
        <Link className={buttonClass("primary", "md", true)} to="/welcome">
          Sign in again
        </Link>
      </div>
    </main>
  );
}
