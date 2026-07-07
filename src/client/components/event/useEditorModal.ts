import { useEffect, useState } from "react";

export function useEditorModal(open: boolean) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  async function save(
    saveFn: () => Promise<void>,
    fallbackMessage: string,
  ): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
      await saveFn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, error, save };
}
