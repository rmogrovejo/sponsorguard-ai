import { ReviewWorkspace } from "./features/review/ReviewWorkspace";

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to review workspace
      </a>

      <header className="masthead">
        <div className="page-frame masthead__inner">
          <div className="wordmark" aria-label="SponsorGuard AI">
            <span className="wordmark__mark" aria-hidden="true">
              SG
            </span>
            <span className="wordmark__name">
              SponsorGuard <span>AI</span>
            </span>
          </div>

          <div className="masthead__meta" aria-label="Application mode">
            <span>Editorial preflight</span>
            <span className="masthead__divider" aria-hidden="true" />
            <span className="mono-label">DETERMINISTIC / 01</span>
          </div>
        </div>
      </header>

      <main id="main-content" className="page-frame">
        <section className="review-introduction" aria-labelledby="page-title">
          <div className="section-index">
            <span>Pre-publish quality control</span>
            <span className="mono-label">PROTOCOL / REVIEW</span>
          </div>

          <div className="review-introduction__grid">
            <div>
              <p className="review-introduction__eyebrow mono-label">
                SPONSORGUARD AI
              </p>
              <h1 id="page-title">Pre-publish review</h1>
            </div>
            <p>
              Configure campaign rules, submit an SRT transcript, and receive
              timestamped deterministic findings before the creator publishes.
            </p>
          </div>
        </section>

        <ReviewWorkspace />

        <footer className="page-note">
          <span>Automated QA for creator sponsorships</span>
          <span className="mono-label">DETERMINISTIC REVIEW SYSTEM</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
