import { useEffect, useRef } from "react";

export function ScenarioDialog({ title, focusKey, children, onClose }: {
  title: string; focusKey: string; children: React.ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const backdropDown = useRef(false);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [focusKey]);
  const outside = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = dialog.current!.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  return <dialog ref={dialog} className={`scenario-dialog${focusKey === "story" ? " scenario-dialog--story" : ""}`}
    aria-modal="true" aria-labelledby="scenario-dialog-title"
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const stops = [...dialog.current!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(element => {
        const closedDetails = element.closest("details:not([open])");
        return !closedDetails || (element.tagName === "SUMMARY" && element.parentElement === closedDetails);
      });
      const first = stops[0];
      const last = stops.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault(); last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus({ preventScroll: true });
      }
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { backdropDown.current = event.target === event.currentTarget && outside(event); }}
    onClick={event => {
      if (backdropDown.current && event.target === event.currentTarget && outside(event)) onClose();
      backdropDown.current = false;
    }}>
    <header className="scenario-dialog-heading">
      <h2 id="scenario-dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
      <button className="scenario-dialog-close" aria-label={`關閉${title}`} onClick={onClose}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </header>
    <div ref={content} className="scenario-dialog-content">{children}</div>
  </dialog>;
}

