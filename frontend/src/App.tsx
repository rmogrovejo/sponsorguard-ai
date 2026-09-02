const workflowSteps = [
  {
    number: "01",
    type: "Campaign input",
    title: "Sponsor brief",
    description: "Campaign rules, required claims, and prohibited language.",
    state: "Awaiting brief",
  },
  {
    number: "02",
    type: "Creator source",
    title: "Creator transcript",
    description: "Timestamped spoken content prepared for line-by-line review.",
    state: "Awaiting transcript",
  },
  {
    number: "03",
    type: "Review output",
    title: "Compliance results",
    description: "Clear findings paired with precise, reviewable evidence.",
    state: "Not evaluated",
  },
];

const resultStates = [
  { label: "Pass", className: "status-label--pass" },
  { label: "Warning", className: "status-label--warning" },
  { label: "Fail", className: "status-label--fail" },
];

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
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

          <div className="masthead__meta" aria-label="Application status">
            <span>Editorial preflight</span>
            <span className="masthead__divider" aria-hidden="true" />
            <span className="mono-label">BUILD 0.1</span>
          </div>
        </div>
      </header>

      <main id="main-content" className="page-frame">
        <section className="introduction" aria-labelledby="page-title">
          <div className="section-index">
            <span>Pre-publish quality control</span>
            <span className="mono-label">PROTOCOL / 001</span>
          </div>

          <div className="introduction__grid">
            <div>
              <h1 id="page-title">SponsorGuard AI</h1>
              <p className="introduction__lede">
                Automated QA for creator sponsorships
              </p>
            </div>

            <p className="introduction__summary">
              A precise review layer for campaign requirements and creator
              content—designed to surface clear findings before publication.
            </p>
          </div>
        </section>

        <section className="workflow" aria-labelledby="workflow-heading">
          <header className="workflow__header">
            <div>
              <p className="workflow__kicker">Review docket</p>
              <h2 id="workflow-heading">Campaign workflow</h2>
            </div>
            <div className="workflow__case-meta">
              <span>Future workspace preview</span>
              <span className="mono-label">CASE / UNASSIGNED</span>
            </div>
          </header>

          <ol className="workflow__steps">
            {workflowSteps.map((step) => (
              <li key={step.number} className="workflow-step">
                <span className="workflow-step__number mono-label">
                  {step.number}
                </span>
                <div className="workflow-step__copy">
                  <p className="workflow-step__type mono-label">{step.type}</p>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
                <span className="queue-label">{step.state}</span>
              </li>
            ))}
          </ol>

          <footer className="workflow__footer">
            <div>
              <p className="workflow__kicker">Result language</p>
              <p className="workflow__footer-note">
                Status color is reserved for evaluated compliance findings.
              </p>
            </div>
            <div className="result-key" aria-label="Future compliance statuses">
              {resultStates.map((state) => (
                <span
                  key={state.label}
                  className={`status-label ${state.className}`}
                >
                  {state.label}
                </span>
              ))}
            </div>
          </footer>
        </section>

        <footer className="page-note">
          <span>Campaign compliance review system</span>
          <span className="mono-label">NO CAMPAIGN LOADED</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
