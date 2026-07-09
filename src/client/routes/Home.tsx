import { Link } from "react-router-dom";
import { Container, Grid } from "../components/layout";
import { Button, buttonClass } from "../components/ui/Button";
import { PerformanceCard } from "../components/cards/PerformanceCard";
import { Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { listEvents } from "../lib/events";
import { getArchiveStats } from "../lib/stats";
import heroImage from "../../../images/hero.jpg";
import bjbcImage from "../../../images/bjbc.jpg";
import styles from "./Home.module.css";
import { Icon } from "@client/components/ui/Icon";
import { cn } from "@client/lib/cn";
import { Decor } from "@client/components/ui/Decor";
import { MediaFrame } from "@client/components/media/MediaFrame";

export default function Home() {
  const { data, loading } = useAsync(
    () => listEvents({ sort: "modified" }),
    [],
  );
  const { data: stats } = useAsync(() => getArchiveStats(), []);

  const recent = (data?.results ?? []).slice(0, 4);

  return (
    <>
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

      
      <section className={cn(styles.intro, styles.section)}>
        <Container>
          <div className={styles.introLayout}>
            <div className={styles.introContent}>
              <Decor />
              <h2 className={styles.introTitle}>A private archive, not a feed.</h2>
              <p>
              The shows. The sessions. The parties. The recordings. 
              The people and the stories that grew around all of it. Facebook forgets. This doesn't.
              </p>

              <p>
              Every member can browse the timeline, contribute memories, and upload media. 
              The archive grows as we remember together.
              </p>
              
              <Link to="/timeline">
                <Button variant="ghost">Start at the beginning</Button>
              </Link>
            </div>

            {stats && (
              <aside className={styles.stats} aria-label="Archive totals">
                <div className={styles.stat}>
                  <span className={styles.statValue}>{stats.performanceCount}</span>
                  <span className={styles.statLabel}>Performances documented</span>
                </div>
                <div className={styles.stat}>
                  <span className={cn(styles.statValue, styles.statValueRange)}>
                    {stats.yearsActive.start}&ndash;{stats.yearsActive.end}
                  </span>
                  <span className={styles.statLabel}>Years active</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{stats.venueCount}</span>
                  <span className={styles.statLabel}>Venues played</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{stats.actCount}</span>
                  <span className={styles.statLabel}>Acts performed with</span>
                </div>
              </aside>
            )}
          </div>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Featured events</h2>
            <Link to="/timeline" className={styles.sectionLink}>
              All events <Icon name="chevron-right" className={styles.linkIcon} />
            </Link>
          </div>
          {loading ? (
            <Spinner label="Loading recent additions" />
          ) : (
            <Grid min={240}>
              {recent.map((event) => (
                <PerformanceCard key={event.id} event={event} />
              ))}
            </Grid>
          )}
        </Container>
      </section>
      
      <section className={cn(styles.section, styles.sectionBordered)}>
        <Container>
          <div className={styles.bjbcLayout}>
            <div className={styles.bjbcImageWrap}>
              <MediaFrame
                type="photo"
                src={bjbcImage}
                title="Big Jazz Boy Convention Volume 1 — the conglomerate flask"
                aspectRatio={1}
                isOpenable={false}
                overlay={true}
              />
            </div>
            <div className={styles.bjbcContent}>
              <p className={styles.bjbcEyebrow}>
                Funk is its own reward
              </p>
              <blockquote className={styles.bjbcQuote}>
                &ldquo;Funk is love. Funk is life.&rdquo;
              </blockquote>
              <p className={styles.bjbcBody}>
                The band&rsquo;s mythology is preserved here — not just the shows, but the
                inside language, the relics, and the jokes that made the whole thing
                worth documenting.
              </p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
