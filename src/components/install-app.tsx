"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const initialize = window.setTimeout(
      () =>
        setInstalled(
          window.matchMedia("(display-mode: standalone)").matches ||
            ("standalone" in navigator &&
              Boolean(
                (navigator as Navigator & { standalone?: boolean }).standalone,
              )),
        ),
      0,
    );
    const offer = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const complete = () => {
      setInstalled(true);
      setShowHelp(false);
    };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.clearTimeout(initialize);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  if (installed) return null;
  return (
    <div className="install-control">
      <button
        className="install-button"
        type="button"
        aria-label="Install Rainline"
        aria-expanded={showHelp}
        aria-controls={showHelp ? "install-help" : undefined}
        onClick={async () => {
          if (promptEvent) {
            await promptEvent.prompt();
            const result = await promptEvent.userChoice;
            if (result.outcome === "accepted") setPromptEvent(null);
          } else setShowHelp((value) => !value);
        }}
      >
        <Download size={15} aria-hidden="true" />
        <span>Install app</span>
      </button>
      {showHelp && (
        <div className="install-help" id="install-help" role="status">
          <button
            type="button"
            aria-label="Close install help"
            onClick={() => setShowHelp(false)}
          >
            <X size={14} />
          </button>
          <strong>Add Rainline to your home screen</strong>
          <p>
            On iPhone or iPad, tap Share → Add to Home Screen. On other devices,
            open your browser menu and choose Install app.
          </p>
        </div>
      )}
    </div>
  );
}
