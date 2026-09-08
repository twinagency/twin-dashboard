"use client";

import { useEffect } from "react";

/**
 * Keeps the fleet earnings chart tooltip usable when many creators earned in
 * the same bucket. Recharts owns the tooltip markup, so this enhancer only
 * changes presentation: date + earning-creator count first, Total second, then
 * a bounded/scrollable creator list. No revenue data or chart calculations are
 * changed here.
 */
export default function RevenueTooltipFix() {
  useEffect(() => {
    let raf = 0;

    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".recharts-tooltip-wrapper").forEach((wrapper) => {
        const content = wrapper.firstElementChild;
        if (!(content instanceof HTMLElement)) return;

        const children = Array.from(content.children).filter(
          (node): node is HTMLElement => node instanceof HTMLElement,
        );
        if (children.length < 2) return;

        // Only touch the multi-creator earnings tooltip. The page also has
        // single-value Recharts tooltips for Peak hours / Peak days.
        const totalRow = children.find((node) => {
          const first = node.firstElementChild;
          return first?.textContent?.trim() === "Total";
        });
        if (!totalRow) return;

        const labelRow = children[0];
        const creatorRows = children.filter(
          (node) => node !== labelRow && node !== totalRow && node.querySelector(".creator-name"),
        );

        content.dataset.revenueTooltipEnhanced = "true";
        labelRow.dataset.paidCount = ` (${creatorRows.length})`;

        // Reorder visually without moving React-owned DOM nodes. Total is now
        // always visible immediately under the hovered date instead of being
        // stranded below a long creator list.
        labelRow.style.order = "0";
        totalRow.style.order = "1";
        creatorRows.forEach((row) => {
          row.style.order = "2";
        });

        // Let a long creator list scroll on desktop and touch devices rather
        // than expanding beyond the viewport.
        wrapper.style.pointerEvents = "auto";
      });
    };

    const scheduleEnhance = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(enhance);
    };

    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    scheduleEnhance();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <style jsx global>{`
      [data-revenue-tooltip-enhanced="true"] {
        display: flex;
        width: min(19rem, calc(100vw - 1.5rem));
        max-width: calc(100vw - 1.5rem);
        max-height: min(28rem, calc(100vh - 2rem));
        flex-direction: column;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      [data-revenue-tooltip-enhanced="true"] > :first-child::after {
        content: attr(data-paid-count);
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
      }

      [data-revenue-tooltip-enhanced="true"] > :first-child {
        flex: 0 0 auto;
      }

      [data-revenue-tooltip-enhanced="true"] > :last-child {
        flex: 0 0 auto;
      }

      [data-revenue-tooltip-enhanced="true"] > [style*="order: 1"] {
        margin-top: 0;
        margin-bottom: 0.35rem;
      }

      [data-revenue-tooltip-enhanced="true"] .creator-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `}</style>
  );
}
