import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { RadioGroup } from "../components/form";
import { Button, buttonClass } from "../components/ui/Button";
import { Spinner } from "../components/state";
import { verifyInviteToken } from "../lib/admin";
import { ApiClientError } from "../lib/api";
import { buildWelcomeQuiz, pickWrongAnswerMessage } from "../lib/welcomeQuiz";
import styles from "./Welcome.module.css";

export default function Welcome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [inviteeName, setInviteeName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [quiz] = useState(() => buildWelcomeQuiz());
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [quizError, setQuizError] = useState<string | null>(null);

  function handleContinue() {
    if (selectedAnswer === quiz.correctValue) {
      navigate("/");
      return;
    }
    setQuizError(pickWrongAnswerMessage());
  }

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
        <header className={styles.header}>
          <img
            className={styles.logo}
            src="/ico/logo-transparent.png"
            alt=""
            width={96}
            height={96}
          />
          <p className={styles.brand}>The Conglomerate</p>
        </header>
        {loading ? (
          <Spinner label="Verifying invite" />
        ) : error ? (
          <>
            <p className={styles.tagline}>{error}</p>
            <Link className={buttonClass("primary", "md", true)} to="/signin" style={{ display: "none" }}>
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <p className={styles.tagline}>
              Hi {inviteeName}, you've been invited to explore our private band archive.
            </p>
            <hr style={{ margin: "0" }} />
            <div className={styles.quiz}>
              <RadioGroup
                legend={quiz.prompt}
                name="welcome-quiz"
                value={selectedAnswer}
                onChange={(value) => {
                  setSelectedAnswer(value);
                  setQuizError(null);
                }}
                options={quiz.options}
              />
            </div>
            {quizError && (
              <p className={styles.quizError} role="alert">
                {quizError}
              </p>
            )}
            <Button
              variant="primary"
              size="md"
              block
              disabled={!selectedAnswer}
              onClick={handleContinue}
            >
              Continue
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
