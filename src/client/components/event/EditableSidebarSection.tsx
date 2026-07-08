import { useState, type ReactNode } from "react";
import { SectionTitle } from "../ui/Card";
import styles from "./event.module.css";
import { Button } from "../ui/Button";

interface EditableSidebarSectionProps<T> {
  title: string;
  items: T[];
  isEditor: boolean;
  emptyMessage: string;
  addLabel: string;
  editLabel: string;
  getItemKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  onReload: () => void;
  renderModal: (props: {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
  }) => ReactNode;
}

export function EditableSidebarSection<T>({
  title,
  items,
  isEditor,
  emptyMessage,
  addLabel,
  editLabel,
  getItemKey,
  renderItem,
  onReload,
  renderModal,
}: EditableSidebarSectionProps<T>) {
  const [modalOpen, setModalOpen] = useState(false);

  if (items.length === 0 && !isEditor) return null;

  function closeModal() {
    setModalOpen(false);
  }

  function handleSaved() {
    setModalOpen(false);
    onReload();
  }

  return (
    <>
      <div className={styles.sidebarCard}>
        <SectionTitle>{title}</SectionTitle>
        {items.length > 0 ? (
          <>
            <ul className={styles.billList}>
              {items.map((item) => (
                <li key={getItemKey(item)}>{renderItem(item)}</li>
              ))}
            </ul>
          </>
        ) : null}

        {isEditor && (
          <div className={styles.sidebarActions}>
            <Button
              size="sm"
              variant="ghost-primary"
              onClick={() => setModalOpen(true)}
              className={styles.sidebarButton}
            >
              {items.length > 0 ? editLabel : addLabel}
            </Button>
          </div>
        )}
      </div>

      {renderModal({
        open: modalOpen,
        onClose: closeModal,
        onSaved: handleSaved,
      })}
    </>
  );
}
