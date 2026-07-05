import { Link } from "react-router-dom";
import { Container, Grid } from "../components/layout";
import { buttonClass } from "../components/ui/Button";
import { PerformanceCard } from "../components/cards/PerformanceCard";
import { Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { apiFetch } from "../lib/api";
import { eventDateLabel } from "../lib/format";
import type { EventListItemDTO } from "@shared/dto";
import type { ListResult } from "@shared/types";
import heroImage from "../../../images/652176842_26582093478065608_5395107200525570428_n.jpg";
import styles from "./Home.module.css";

export default function Home() {
  const { data, loading } = useAsync(
    () => apiFetch<ListResult<EventListItemDTO>>("/api/events?sort=modified"),
    [],
  );

  const recent = (data?.results ?? []).slice(0, 6);

  return (
    <Container width="wide">
      <section className={styles.heroBanner}>
        <img
          className={styles.heroPhoto}
          src={heroImage}
          alt=""
          loading="eager"
        />
        <div className={styles.heroOverlay}>
          <span className={styles.eyebrow}>est. College Station, Texas</span>
          <h1 className={styles.title}>
            The
            <br/>
            Conglomerate
          </h1>
          <p className={styles.lede}>
            Every show. Every session. Every story. Preserved here for the people who lived it.
          </p>
          <div className={styles.ctas}>
            <Link to="/timeline" className={buttonClass("primary")}>
              Enter the Archive
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.intro}>
        <h2 className={styles.introTitle}>A private archive, not a feed.</h2>
        <p>
        The shows. The sessions. The parties. The recordings. 
        The people and the stories that grew around all of it. Facebook forgets. This doesn't.
        </p>
        <p>
        Every event page holds two layers: a curated account of what happened, 
        and the raw member memories from which that account was built.
        </p>
        <p>
        Every member can browse the timeline, contribute memories, and upload media. 
        The archive grows as we remember together.
        </p>
        <p>
        <Link to="/timeline">Start at the beginning</Link>
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Recently added</h2>
          <Link to="/timeline" className={styles.sectionLink}>
            View all
          </Link>
        </div>
        {loading ? (
          <Spinner label="Loading recent additions" />
        ) : (
          <Grid min={240}>
            {recent.map((e) => (
              <PerformanceCard
                key={e.id}
                slug={e.slug}
                title={e.title}
                dateLabel={eventDateLabel(e)}
                place={e.place?.name}
                eventType={e.eventType}
                imageUrl={e.heroImageUrl}
                media={e.media}
              />
            ))}
          </Grid>
        )}
      </section>
    </Container>
  );
}
