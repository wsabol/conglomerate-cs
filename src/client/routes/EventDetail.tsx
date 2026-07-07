import { useParams } from "react-router-dom";
import { Container } from "../components/layout";
import { EventDetailView } from "../components/event/EventDetailView";
import { ErrorState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { getEvent } from "../lib/events";

export default function EventDetail() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync(
    () => getEvent(slug!),
    [slug],
  );

  if (loading && !data) {
    return (
      <Container>
        <Spinner label="Loading event" />
      </Container>
    );
  }

  if (error || !data) {
    return (
      <Container>
        <ErrorState
          title="Event not found"
          message={error?.message}
          onRetry={reload}
        />
      </Container>
    );
  }

  return <EventDetailView event={data} onReload={reload} />;
}
