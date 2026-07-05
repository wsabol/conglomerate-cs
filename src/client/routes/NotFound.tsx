import { Link } from "react-router-dom";
import { Container } from "../components/layout";
import { EmptyState } from "../components/state";
import { buttonClass } from "../components/ui/Button";

export default function NotFound() {
  return (
    <Container>
      <EmptyState
        title="This page isn't in the archive"
        icon="search"
        action={
          <Link to="/" className={buttonClass("ghost", "sm")}>
            Back home
          </Link>
        }
      >
        The page you were looking for could not be found.
      </EmptyState>
    </Container>
  );
}
