import { useEffect, useState } from "react";

import { ClearDraftControl } from "./features/persistence/ClearDraftControl";
import { DraftStatus } from "./features/persistence/DraftStatus";
import { useCreatorDraft } from "./features/persistence/useCreatorDraft";
import { ReviewWorkspace } from "./features/review/ReviewWorkspace";
import { ProductNav } from "./features/shell/ProductNav";
import type { ProductModule } from "./features/shell/productModules";
import { ShortFormWorkspace } from "./features/shortform/ShortFormWorkspace";

function App() {
  const draft = useCreatorDraft();
  const [module, setModule] = useState<ProductModule>(draft.initialDraft.activeModule);

  useEffect(() => {
    draft.updateActiveModule(module);
  }, [module, draft.updateActiveModule]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="masthead">
        <div className="page-frame masthead__inner">
          <div className="wordmark" aria-label="CreatorPreflight">
            <span className="wordmark__mark" aria-hidden="true">
              CP
            </span>
            <span className="wordmark__name">
              CreatorPreflight
            </span>
          </div>

          <div className="masthead__meta" aria-label="Application mode">
            <span>Know what to fix before you publish.</span>
            <span className="masthead__divider" aria-hidden="true" />
            <span className="mono-label">PREFLIGHT / 02</span>
            {draft.statusText && (
              <>
                <span className="masthead__divider" aria-hidden="true" />
                <DraftStatus status={draft.status} />
              </>
            )}
          </div>
        </div>
      </header>

      <div className="product-layout">
        <ProductNav module={module} onChange={setModule} />
        <main id="main-content" className="product-stage">
          {draft.invalidNotice && (
            <p className="draft-restore-notice" role="status">
              <span className="mono-label">DRAFT</span>
              An invalid saved draft could not be restored.
              <button className="text-button" type="button" onClick={draft.dismissInvalidNotice}>
                Dismiss
              </button>
            </p>
          )}
          <div hidden={module !== "shortform"}>
            <ShortFormWorkspace
              key={`shortform-${draft.epoch}`}
              initialPlatform={draft.initialDraft.shortForm.platform}
              restoredVideoSelected={draft.initialDraft.shortForm.hadVideoSelected}
              onDraftChange={draft.updateShortForm}
            />
          </div>
          <div hidden={module !== "sponsored"}>
            <section className="review-introduction" aria-labelledby="sponsored-title">
              <div className="section-index">
                <span>Sponsored Content / SponsorGuard</span>
                <span className="mono-label">PROTOCOL / COMPLIANCE</span>
              </div>
              <div className="review-introduction__grid">
                <div>
                  <p className="review-introduction__eyebrow mono-label">
                    SPONSORGUARD
                  </p>
                  <h1 id="sponsored-title">Pre-publish review</h1>
                </div>
                <p>
                  Configure campaign rules, submit an SRT transcript, and receive
                  timestamped deterministic findings before the creator publishes.
                </p>
              </div>
            </section>
            <ReviewWorkspace
              key={`sponsored-${draft.epoch}`}
              initialCampaignName={draft.initialDraft.sponsoredContent.campaignName}
              initialSponsorBrief={draft.initialDraft.sponsoredContent.sponsorBrief}
              initialRequirements={draft.initialDraft.sponsoredContent.requirements}
              initialTranscriptContent={draft.initialDraft.sponsoredContent.transcriptContent}
              initialTranscriptFileName={draft.initialDraft.sponsoredContent.transcriptFileName}
              onDraftChange={draft.updateSponsored}
            />
          </div>
          <footer className="page-note">
            <div className="page-note__privacy">
              <span>Drafts are saved locally in this browser. Uploaded videos are not persisted.</span>
              <ClearDraftControl
                meaningful={draft.hasMeaningfulData}
                onClear={() => {
                  draft.startNewDraft();
                  setModule("shortform");
                }}
              />
            </div>
            <span className="mono-label">CREATORPREFLIGHT</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
