import { useState } from "react";

import { ReviewWorkspace } from "./features/review/ReviewWorkspace";
import { ProductNav } from "./features/shell/ProductNav";
import type { ProductModule } from "./features/shell/productModules";
import { ShortFormWorkspace } from "./features/shortform/ShortFormWorkspace";

function App() {
  const [module, setModule] = useState<ProductModule>("shortform");

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
          </div>
        </div>
      </header>

      <div className="product-layout">
        <ProductNav module={module} onChange={setModule} />
        <main id="main-content" className="product-stage">
          <div hidden={module !== "shortform"}>
            <ShortFormWorkspace />
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
            <ReviewWorkspace />
          </div>
          <footer className="page-note">
            <span>Automated pre-publish QA for creators</span>
            <span className="mono-label">CREATORPREFLIGHT</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
