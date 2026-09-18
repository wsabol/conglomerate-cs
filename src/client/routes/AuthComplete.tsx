import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { protectedDestination } from "@shared/accessNavigation";

export default function AuthComplete() {
  const [searchParams] = useSearchParams();
  const next = protectedDestination(searchParams.get("next"));

  useEffect(() => {
    window.location.replace(next);
  }, [next]);

  return <p role="status">Completing sign-in…</p>;
}
