import type { RequirementDraft, RequirementType } from "../../types/compliance";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import type { RequirementFieldErrors } from "../review/reviewValidation";
import { REQUIREMENT_OPTIONS } from "./requirementModel";
import { REQUIREMENT_LABEL_KEYS, REQUIREMENT_TARGET_KEYS } from "./requirementLabels";

const VALUE_PLACEHOLDER: Record<RequirementType, MessageKey> = {
  required_mention: "sponsored.valuePlaceholderMention",
  required_exact_token: "sponsored.valuePlaceholderToken",
  required_url: "sponsored.valuePlaceholderUrl",
  required_talking_point: "sponsored.valuePlaceholderTalking",
  forbidden_phrase: "sponsored.valuePlaceholderPhrase",
  forbidden_claim: "sponsored.valuePlaceholderClaim",
  required_mention_before: "sponsored.valuePlaceholderMention",
};

interface RequirementEditorProps {
  requirement: RequirementDraft;
  position: number;
  disabled: boolean;
  errors?: RequirementFieldErrors;
  onChange: (requirement: RequirementDraft) => void;
  onRemove: () => void;
}

export function RequirementEditor({
  requirement,
  position,
  disabled,
  errors,
  onChange,
  onRemove,
}: RequirementEditorProps) {
  const { t } = useTranslation();
  const fieldPrefix = `requirement-${requirement.id}`;

  const updateType = (type: RequirementType) => {
    onChange({
      ...requirement,
      type,
      beforeSeconds:
        type === "required_mention_before"
          ? requirement.beforeSeconds || "60"
          : "",
    });
  };

  return (
    <article className="requirement-editor" aria-labelledby={`${fieldPrefix}-title`}>
      <header className="requirement-editor__header">
        <div>
          <span className="requirement-editor__index mono-label">
            {t("sponsored.rule", { n: String(position).padStart(2, "0") })}
          </span>
          <h3 id={`${fieldPrefix}-title`}>{t("sponsored.requirementN", { n: position })}</h3>
        </div>
        <button
          className="text-button text-button--danger"
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={t("sponsored.removeN", { n: position })}
        >
          {t("sponsored.remove")}
        </button>
      </header>

      <div className="field-grid">
        <div className="form-field">
          <label htmlFor={`${fieldPrefix}-type`}>{t("sponsored.ruleType")}</label>
          <select
            id={`${fieldPrefix}-type`}
            value={requirement.type}
            disabled={disabled}
            onChange={(event) => updateType(event.target.value as RequirementType)}
            aria-label={t("sponsored.requirementTypeAria", { n: position })}
          >
            {REQUIREMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(REQUIREMENT_LABEL_KEYS[option.value])}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field form-field--wide">
          <label htmlFor={`${fieldPrefix}-description`}>{t("sponsored.reviewInstruction")}</label>
          <input
            id={`${fieldPrefix}-description`}
            type="text"
            value={requirement.description}
            disabled={disabled}
            maxLength={500}
            placeholder={t("sponsored.instructionPlaceholder")}
            onChange={(event) =>
              onChange({ ...requirement, description: event.target.value })
            }
            aria-label={t("sponsored.requirementDescriptionAria", { n: position })}
            aria-invalid={Boolean(errors?.description)}
            aria-describedby={
              errors?.description ? `${fieldPrefix}-description-error` : undefined
            }
          />
          {errors?.description && (
            <p
              className="field-error"
              id={`${fieldPrefix}-description-error`}
            >
              {t(errors.description)}
            </p>
          )}
        </div>

        <div className="form-field form-field--wide">
          <label htmlFor={`${fieldPrefix}-value`}>
            {t(REQUIREMENT_TARGET_KEYS[requirement.type])}
          </label>
          <input
            id={`${fieldPrefix}-value`}
            type="text"
            value={requirement.value}
            disabled={disabled}
            maxLength={500}
            placeholder={t(VALUE_PLACEHOLDER[requirement.type])}
            inputMode={requirement.type === "required_url" ? "url" : "text"}
            onChange={(event) =>
              onChange({ ...requirement, value: event.target.value })
            }
            aria-label={t("sponsored.requirementValueAria", { n: position })}
            aria-invalid={Boolean(errors?.value)}
            aria-describedby={
              errors?.value ? `${fieldPrefix}-value-error` : undefined
            }
          />
          {errors?.value && (
            <p className="field-error" id={`${fieldPrefix}-value-error`}>
              {t(errors.value)}
            </p>
          )}
        </div>

        {requirement.type === "required_mention_before" && (
          <div className="form-field form-field--deadline">
            <label htmlFor={`${fieldPrefix}-deadline`}>{t("sponsored.deadlineLabel")}</label>
            <div className="number-field">
              <input
                id={`${fieldPrefix}-deadline`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={requirement.beforeSeconds}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...requirement, beforeSeconds: event.target.value })
                }
                aria-label={t("sponsored.requirementDeadlineAria", { n: position })}
                aria-invalid={Boolean(errors?.beforeSeconds)}
                aria-describedby={
                  errors?.beforeSeconds
                    ? `${fieldPrefix}-deadline-error`
                    : `${fieldPrefix}-deadline-hint`
                }
              />
              <span aria-hidden="true">SEC</span>
            </div>
            <p className="field-hint" id={`${fieldPrefix}-deadline-hint`}>
              {t("sponsored.deadlineHint")}
            </p>
            {errors?.beforeSeconds && (
              <p className="field-error" id={`${fieldPrefix}-deadline-error`}>
                {t(errors.beforeSeconds)}
              </p>
            )}
          </div>
        )}
      </div>

      {requirement.provenance && (
        <details className="requirement-source">
          <summary>{t("sponsored.sourceFromBrief")}</summary>
          <blockquote>“{requirement.provenance.sourceText}”</blockquote>
        </details>
      )}
    </article>
  );
}
