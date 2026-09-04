import type { ReactNode } from "react";

interface SectionHeaderProps {
  step: string;
  title: string;
  titleId: string;
  description: string;
  action?: ReactNode;
}

export function SectionHeader({
  step,
  title,
  titleId,
  description,
  action,
}: SectionHeaderProps) {
  return (
    <header className="review-section__header">
      <div className="section-number mono-label">{step}</div>
      <div className="review-section__copy">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="review-section__action">{action}</div> : null}
    </header>
  );
}
