import type { RequirementDraft } from "../../types/compliance";
import { useTranslation } from "../../i18n/useTranslation";
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
  const { t } = useTranslation();
  return (
    <section className="review-section" aria-labelledby="requirements-heading">
      <SectionHeader
        step={t("sponsored.reqStep")}
        title={t("sponsored.reqTitle")}
        titleId="requirements-heading"
        description={t("sponsored.reqBody")}
        action={
          <button
            className="secondary-button"
            type="button"
            disabled={disabled}
            onClick={onAdd}
          >
            {t("sponsored.addRequirement")}
          </button>
        }
      />

      {errors.requirements && (
        <p className="section-error" id="requirements-error" role="alert">
          {t(errors.requirements)}
        </p>
      )}

      <div className="requirement-list" aria-describedby="requirements-error">
        {requirements.length === 0 ? (
          <div className="empty-line">
            <span className="mono-label">{t("sponsored.noRules")}</span>
            <p>{t("sponsored.addToEstablish")}</p>
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
