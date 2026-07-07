import { useState, type ReactNode } from "react";
import { SectionTitle } from "../ui/Card";
import styles from "./event.module.css";

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
            {isEditor && (
              <button
                type="button"
                className={styles.sidebarLink}
                onClick={() => setModalOpen(true)}
              >
                {editLabel}
              </button>
            )}
          </>
        ) : (
          <>
            <p className={styles.sidebarEmpty}>{emptyMessage}</p>
            <button
              type="button"
              className={styles.sidebarLink}
              onClick={() => setModalOpen(true)}
            >
              {addLabel}
            </button>
          </>
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
