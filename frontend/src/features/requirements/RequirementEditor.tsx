import type { RequirementDraft, RequirementType } from "../../types/compliance";
import type { RequirementFieldErrors } from "../review/reviewValidation";
import {
  getTargetLabel,
  REQUIREMENT_OPTIONS,
} from "./requirementModel";

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
            RULE / {String(position).padStart(2, "0")}
          </span>
          <h3 id={`${fieldPrefix}-title`}>Requirement {position}</h3>
        </div>
        <button
          className="text-button text-button--danger"
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Remove requirement ${position}`}
        >
          Remove
        </button>
      </header>

      <div className="field-grid">
        <div className="form-field">
          <label htmlFor={`${fieldPrefix}-type`}>Rule type</label>
          <select
            id={`${fieldPrefix}-type`}
            value={requirement.type}
            disabled={disabled}
            onChange={(event) => updateType(event.target.value as RequirementType)}
            aria-label={`Requirement ${position} type`}
          >
            {REQUIREMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field form-field--wide">
          <label htmlFor={`${fieldPrefix}-description`}>Review instruction</label>
          <input
            id={`${fieldPrefix}-description`}
            type="text"
            value={requirement.description}
            disabled={disabled}
            maxLength={500}
            placeholder="e.g. Mention the sponsor before 01:00"
            onChange={(event) =>
              onChange({ ...requirement, description: event.target.value })
            }
            aria-label={`Requirement ${position} description`}
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
              {errors.description}
            </p>
          )}
        </div>

        <div className="form-field form-field--wide">
          <label htmlFor={`${fieldPrefix}-value`}>
            {getTargetLabel(requirement.type)}
          </label>
          <input
            id={`${fieldPrefix}-value`}
            type="text"
            value={requirement.value}
            disabled={disabled}
            maxLength={500}
            placeholder={
              requirement.type === "required_exact_token"
                ? "e.g. CREATOR25"
                : "e.g. AcmeVPN"
            }
            onChange={(event) =>
              onChange({ ...requirement, value: event.target.value })
            }
            aria-label={`Requirement ${position} target value`}
            aria-invalid={Boolean(errors?.value)}
            aria-describedby={
              errors?.value ? `${fieldPrefix}-value-error` : undefined
            }
          />
          {errors?.value && (
            <p className="field-error" id={`${fieldPrefix}-value-error`}>
              {errors.value}
            </p>
          )}
        </div>

        {requirement.type === "required_mention_before" && (
          <div className="form-field form-field--deadline">
            <label htmlFor={`${fieldPrefix}-deadline`}>Deadline in seconds</label>
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
                aria-label={`Requirement ${position} deadline in seconds`}
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
              A mention at the exact deadline is accepted.
            </p>
            {errors?.beforeSeconds && (
              <p className="field-error" id={`${fieldPrefix}-deadline-error`}>
                {errors.beforeSeconds}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
