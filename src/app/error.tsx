"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({ event: "render_error", digest: error.digest ?? null }),
    );
  }, [error]);
  return (
    <main className="full-state">
      <div className="brand-mark">R</div>
      <h1>Something interrupted the forecast.</h1>
      <p>Rainline could not display this screen.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
