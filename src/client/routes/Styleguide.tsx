import { useState } from "react";
import { Container, Grid, Stack } from "../components/layout";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Pill, Tag } from "../components/ui/Pill";
import { Card, SectionTitle } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { PerformanceCard } from "../components/cards/PerformanceCard";
import { MediaFrame } from "../components/media/MediaFrame";
import { Memory } from "../components/memory/Memory";
import { EmptyState, ErrorState, Skeleton, Spinner } from "../components/state";
import {
  RadioGroup,
  Select,
  TextArea,
  TextField,
} from "../components/form";
import styles from "./Styleguide.module.css";

const SWATCHES = [
  ["Background", "#080A09"],
  ["Surface", "#171A18"],
  ["Raised", "#242825"],
  ["Text", "#F1E9DA"],
  ["Secondary", "#B7B0A2"],
  ["Emerald", "#078A70"],
  ["Brass", "#C49A47"],
  ["Orange", "#C64C27"],
  ["Magenta", "#8C4F78"],
  ["Violet", "#554B69"],
] as const;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <p className={styles.sectionLabel}>{label}</p>
      {children}
    </section>
  );
}

export default function Styleguide() {
  const [modalOpen, setModalOpen] = useState(false);
  const [year, setYear] = useState("2011");
  const [radio, setRadio] = useState("personal");

  return (
    <Container>
      <PageHeader
        eyebrow="Design system"
        title="Styleguide"
        subtitle="Every shared component in its variants and states."
      />

      <Section label="Color">
        <div className={styles.swatches}>
          {SWATCHES.map(([name, hex]) => (
            <div key={name} className={styles.swatch}>
              <div className={styles.swatchColor} style={{ background: hex }} />
              <div className={styles.swatchLabel}>
                {name} {hex}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Typography">
        <div className={styles.typeRow}>
          <h1>Display heading (Bodoni Moda)</h1>
          <h3>Section heading</h3>
          <p>Body copy in Inter at the minimum 16px body size.</p>
          <p className="mono">Metadata in IBM Plex Mono - 5/14/2011, 9:00 PM</p>
        </div>
      </Section>

      <Section label="Buttons">
        <Stack gap={3}>
          <div className={styles.row}>
            <Button variant="primary">Add a memory</Button>
            <Button variant="brass">Featured</Button>
            <Button variant="orange">High energy</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
          </div>
          <div className={styles.row}>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Stack>
      </Section>

      <Section label="Pills & tags">
        <Stack gap={3}>
          <div className={styles.row}>
            {["2009", "2010", "2011", "2012"].map((y) => (
              <Pill key={y} active={y === year} onClick={() => setYear(y)}>
                {y}
              </Pill>
            ))}
          </div>
          <div className={styles.row}>
            <Tag icon="calendar" iconLabel="Date">
              5/14/2011
            </Tag>
            <Tag icon="place" iconLabel="Place">
              Muldoon's
            </Tag>
            <Tag icon="people" iconLabel="Personnel">
              Will, McIan, Brent
            </Tag>
          </div>
        </Stack>
      </Section>

      <Section label="Form controls">
        <Stack gap={4} style={{ maxWidth: 460 }}>
          <TextField label="Title" placeholder="Downtown Uncorked Jazz Jam" />
          <TextField
            label="Email"
            type="email"
            error="Enter a valid email address"
            defaultValue="not-an-email"
          />
          <TextArea label="What do you remember?" placeholder="Share the story..." />
          <Select
            label="Event type"
            placeholder="Choose a type"
            options={[
              { value: "performance", label: "Performance" },
              { value: "party", label: "Party" },
              { value: "rehearsal", label: "Rehearsal" },
            ]}
          />
          <RadioGroup
            legend="Is this something you remember?"
            name="memory-type"
            value={radio}
            onChange={setRadio}
            options={[
              { value: "personal", label: "Something you personally remember" },
              { value: "secondhand", label: "Something someone else told you" },
              { value: "correction", label: "A correction or clarification" },
              { value: "quote", label: "A quote or saying" },
            ]}
          />
        </Stack>
      </Section>

      <Section label="Cards">
        <Grid min={240}>
          <PerformanceCard
            slug="demo-1"
            title="Downtown Uncorked Jazz Jam"
            dateLabel="12/9/2009"
            place="Downtown Uncorked"
            eventType="performance"
            headlined
            media={{ photo: true, audio: true, setlist: true }}
          />
          <PerformanceCard
            slug="demo-2"
            title="Rock Your Independence"
            dateLabel="Around 7/3/2010"
            place="Schotzi's"
            eventType="performance"
            media={{ video: true }}
          />
        </Grid>
      </Section>

      <Section label="Media frames">
        <Grid min={260}>
          <MediaFrame
            type="audio"
            src=""
            title="Live set - 2010-04-25"
            caption="Recorded by Eddie"
          />
          <MediaFrame
            type="document"
            src="#"
            title="Setlist scan"
          />
          <MediaFrame type="link" src="#" title="Facebook event" />
        </Grid>
      </Section>

      <Section label="Memories">
        <Card>
          <SectionTitle>Memberberries</SectionTitle>
          <Memory
            body="I distinctly remember Brent ripping the Brent note that night."
            authorName="McIan"
            dateLabel="6/6/2026"
            annotationType="personal_memory"
            people={["Brent"]}
          />
          <Memory
            body="Don't bring that guy around."
            authorName="Will"
            dateLabel="6/7/2026"
            annotationType="quote"
            canEdit
            onEdit={() => {}}
            onDelete={() => {}}
          />
        </Card>
      </Section>

      <Section label="Modal">
        <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit memory">
          <Stack gap={4}>
            <TextArea label="What do you remember?" defaultValue="Editing..." />
            <div className={styles.row}>
              <Button onClick={() => setModalOpen(false)}>Save</Button>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </Stack>
        </Modal>
      </Section>

      <Section label="States">
        <Stack gap={5}>
          <div>
            <Stack gap={2} style={{ maxWidth: 400 }}>
              <Skeleton height="1.5rem" width="60%" />
              <Skeleton height="1rem" />
              <Skeleton height="1rem" width="80%" />
            </Stack>
          </div>
          <Spinner />
          <EmptyState title="No memories yet" icon="mic">
            Be the first to add a memory to this event.
          </EmptyState>
          <ErrorState message="We couldn't load this event." onRetry={() => {}} />
        </Stack>
      </Section>
    </Container>
  );
}
