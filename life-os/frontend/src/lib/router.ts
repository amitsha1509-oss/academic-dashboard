import { useEffect, useState } from "react";

// Hash routes (#/today, #/item/abc) — work with any static server and survive reloads.
function current(): string {
  return window.location.hash.replace(/^#/, "") || "/today";
}

export function useRoute(): string[] {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const on = () => {
      setPath(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path.split("/").filter(Boolean);
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export const openItem = (id: string) => navigate(`/item/${id}`);
