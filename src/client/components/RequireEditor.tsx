import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Container } from "./layout";
import { EmptyState, Spinner } from "./state";
import { buttonClass } from "./ui/Button";

/** Gates editor-only routes on the client (server also enforces via requireEditor). */
export function RequireEditor({ children }: { children: ReactNode }) {
  const { isEditor, loading } = useAuth();

  if (loading) {
    return (
      <Container>
        <Spinner label="Checking your access" />
      </Container>
    );
  }

  if (!isEditor) {
    return (
      <Container>
        <EmptyState
          title="Editors only"
          icon="edit"
          action={
            <Link to="/" className={buttonClass("ghost", "sm")}>
              Back home
            </Link>
          }
        >
          This area is limited to editors. Ask an editor if you need access.
        </EmptyState>
      </Container>
    );
  }

  return <>{children}</>;
}
