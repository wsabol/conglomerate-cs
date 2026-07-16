import { Link, useLocation, useNavigate } from "react-router-dom";
import { Container, SidebarLayout } from "../layout";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { useAuth } from "../../lib/auth";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { eventDateOnlyLabel } from "../../lib/format";
import { cn } from "../../lib/cn";
import type { EventDetailDTO } from "@shared/dto";
import { EventPeopleSection } from "./EventPeopleSection";
import { EventPosterCard } from "./EventPosterCard";
import { OtherActsSection } from "./OtherActsSection";
import { SetlistSection } from "./SetlistSection";
import { SourcesSection } from "./SourcesSection";
import { EventHero } from "./EventHero";
import { EventSummaryPanel } from "./EventSummaryPanel";
import { EventPromoPanel } from "./EventPromoPanel";
import styles from "./EventDetailView.module.css";

type DetailTab = "summary" | "description" | "sources";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "description", label: "Event Promo" },
  { id: "sources", label: "Sources" },
];

const DETAIL_TAB_IDS = new Set<DetailTab>(TABS.map(({ id }) => id));

function tabFromHash(hash: string): DetailTab {
  const id = hash.replace(/^#/, "") as DetailTab;
  return DETAIL_TAB_IDS.has(id) ? id : "summary";
}

interface EventDetailViewProps {
  event: EventDetailDTO;
  onReload: () => void;
}

export function EventDetailView({ event, onReload }: EventDetailViewProps) {
  const { user, isEditor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const tab = tabFromHash(location.hash);
  const effectiveTab = isNarrow ? "summary" : tab;

  function selectTab(id: DetailTab) {
    navigate({ hash: id }, { replace: true });
  }

  return (
    <>
      <EventHero event={event} />

      <Container>
        <div className={styles.content}>
          <SidebarLayout
          aside={
            <>
              <OtherActsSection
                event={event}
                isEditor={isEditor}
                onReload={onReload}
              />
              <EventPosterCard event={event} onReload={onReload} />
              <SetlistSection
                event={event}
                isEditor={isEditor}
                onReload={onReload}
              />
              <EventPeopleSection
                event={event}
                isEditor={isEditor}
                onReload={onReload}
              />
            </>
          }
        >
          <div
            className={styles.tabList}
            role="tablist"
            aria-label="Event details"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={styles.tab}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            ))}
            {isEditor && (
              <Link
                to={`/events/${event.slug}/edit`}
                className={cn(styles.tab, styles.editTab)}
              >
                <Button
                  type="button"
                  variant="ghost-primary"
                  size="sm"
                  className={styles.editButton}
                >
                  <Icon name="edit" size={14} /> Edit event
                </Button>
              </Link>
            )}
          </div>

          {effectiveTab === "summary" && (
            <div
              role="tabpanel"
              id="panel-summary"
              aria-labelledby="tab-summary"
              className={styles.tabPanel}
            >
              <EventSummaryPanel
                event={event}
                canUpload={!!user && !isNarrow}
                isEditor={isEditor}
                onReload={onReload}
              />
            </div>
          )}

          {effectiveTab === "description" && (
            <div
              role="tabpanel"
              id="panel-description"
              aria-labelledby="tab-description"
              className={styles.tabPanel}
            >
              <EventPromoPanel event={event} />
            </div>
          )}

          {effectiveTab === "sources" && (
            <div
              role="tabpanel"
              id="panel-sources"
              aria-labelledby="tab-sources"
              className={styles.tabPanel}
            >
              <SourcesSection
                event={event}
                isEditor={isEditor}
                onReload={onReload}
                contextLabel={`${eventDateOnlyLabel(event)} · ${event.title}`}
              />
            </div>
          )}
        </SidebarLayout>
        </div>
      </Container>
    </>
  );
}
