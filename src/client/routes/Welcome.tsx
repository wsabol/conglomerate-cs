import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RadioGroup } from "../components/form";
import { Button } from "../components/ui/Button";
import { getAccessLogin } from "../lib/access";
import { buildWelcomeQuiz, pickWrongAnswerMessage } from "../lib/welcomeQuiz";
import styles from "./Welcome.module.css";

export default function Welcome() {
  const [searchParams] = useSearchParams();
  const [quiz] = useState(() => buildWelcomeQuiz());
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [quizError, setQuizError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    // The local Worker already authenticates DEV_USER_EMAIL. Skip the quiz and
    // Access round trip when this public endpoint reports that override.
    void getAccessLogin(searchParams.get("next"))
      .then(({ url, localDevAuth }) => {
        if (localDevAuth) window.location.replace(url);
      })
      .catch(() => {
        // Keep the normal sign-in screen available if the probe fails.
      });
  }, [searchParams]);

  async function handleContinue() {
    if (selectedAnswer === quiz.correctValue) {
      setSigningIn(true);
      try {
        const { url } = await getAccessLogin(searchParams.get("next"));
        window.location.assign(url);
      } catch {
        setQuizError("Sign-in is unavailable. Please try again.");
        setSigningIn(false);
      }
      return;
    }
    setQuizError(pickWrongAnswerMessage());
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <header className={styles.header}>
          <img
            className={styles.logo}
            src="/ico/logo-transparent.png"
            alt=""
            width={96}
            height={96}
          />
          <h1 className={styles.brand}>The Conglomerate</h1>
        </header>
        <div className={styles.instructions}>
          <p className={styles.tagline}>
            Welcome to our private band archive.
          </p>
          <p className={styles.tagline}>Choose wisely and continue.</p>
        </div>
        <hr className={styles.divider} />
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
          disabled={!selectedAnswer || signingIn}
          loading={signingIn}
          onClick={() => void handleContinue()}
        >
          Continue to sign in
        </Button>
      </div>
    </main>
  );
}
