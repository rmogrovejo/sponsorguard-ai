import type { RequirementDraft } from "../../types/compliance";
import type { ReviewValidationErrors } from "../review/reviewValidation";
import { SectionHeader } from "../shell/SectionHeader";
import { RequirementEditor } from "./RequirementEditor";

interface RequirementsSectionProps {
  requirements: RequirementDraft[];
  disabled: boolean;
  errors: ReviewValidationErrors;
  onAdd: () => void;
  onChange: (requirement: RequirementDraft) => void;
  onRemove: (id: string) => void;
}

export function RequirementsSection({
  requirements,
  disabled,
  errors,
  onAdd,
  onChange,
  onRemove,
}: RequirementsSectionProps) {
  return (
    <section className="review-section" aria-labelledby="requirements-heading">
      <SectionHeader
        step="03 / REQUIREMENTS"
        title="Sponsorship requirements"
        titleId="requirements-heading"
        description="Define the deterministic checks this creator submission must pass."
        action={
          <button
            className="secondary-button"
            type="button"
            disabled={disabled}
            onClick={onAdd}
          >
            Add requirement
          </button>
        }
      />

      {errors.requirements && (
        <p className="section-error" id="requirements-error" role="alert">
          {errors.requirements}
        </p>
      )}

      <div className="requirement-list" aria-describedby="requirements-error">
        {requirements.length === 0 ? (
          <div className="empty-line">
            <span className="mono-label">NO RULES DEFINED</span>
            <p>Add a requirement to establish the review checklist.</p>
          </div>
        ) : (
          requirements.map((requirement, index) => (
            <RequirementEditor
              key={requirement.id}
              requirement={requirement}
              position={index + 1}
              disabled={disabled}
              errors={errors.requirementFields[requirement.id]}
              onChange={onChange}
              onRemove={() => onRemove(requirement.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
