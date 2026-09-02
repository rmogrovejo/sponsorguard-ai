const workflowSteps = [
  "Sponsor brief",
  "Creator transcript",
  "Compliance results",
];

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-xl bg-emerald-400 font-black text-slate-950 shadow-lg shadow-emerald-400/15"
            >
              SG
            </div>
            <div>
              <p className="font-semibold tracking-tight">SponsorGuard AI</p>
              <p className="text-xs text-slate-400">Campaign quality assurance</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-300">
            Initial prototype
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-24">
        <section className="max-w-3xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Pre-publish confidence
          </p>
          <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            SponsorGuard AI
          </h1>
          <p className="mt-6 text-xl leading-8 text-slate-300 sm:text-2xl">
            Automated QA for creator sponsorships
          </p>
          <p className="mt-4 max-w-2xl leading-7 text-slate-400">
            Turn campaign requirements and creator transcripts into clear,
            evidence-backed compliance results before content goes live.
          </p>
        </section>

        <section
          aria-labelledby="workflow-heading"
          className="mt-14 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20"
        >
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="workflow-heading" className="text-lg font-semibold">
                  Campaign workflow
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  The workspace for a future sponsorship review.
                </p>
              </div>
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Coming next
              </span>
            </div>
          </div>

          <div className="grid gap-px bg-white/10 md:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <div key={step} className="bg-slate-950/90 p-6 sm:p-8">
                <span className="text-xs font-semibold text-emerald-300">
                  0{index + 1}
                </span>
                <h3 className="mt-5 font-medium">{step}</h3>
                <div className="mt-8 space-y-3" aria-hidden="true">
                  <div className="h-2.5 w-full rounded-full bg-white/8" />
                  <div className="h-2.5 w-4/5 rounded-full bg-white/8" />
                  <div className="h-2.5 w-2/3 rounded-full bg-white/8" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
