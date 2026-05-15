"use client";

import { useMemo, useState } from "react";
import { ATMOSPHERES } from "../lib/atmosphere";

const demoMix = {
  neutralInfo: 43,
  attentionHeavy: 18,
  syntheticRhythm: 30,
  groundedPace: 9
};

const sampleResult = {
  summary: "Mostly neutral info. Slightly synthetic rhythm.",
  mix: demoMix,
  note: "Atmosphere mix, not truth probability."
};

function dominantAtmosphere(mix) {
  return Object.entries(mix).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutralInfo";
}

function AtmosphereOrb({ mix, size = "large" }) {
  const dominant = dominantAtmosphere(mix);
  const secondary = Object.entries(mix).sort((a, b) => b[1] - a[1])[1]?.[0] || "syntheticRhythm";
  return (
    <div className={`orb orb-${size} orb-${dominant}`} style={{ "--secondary": `var(--${secondary})` }} aria-hidden="true">
      <span />
    </div>
  );
}

function AtmospherePanel({ result = sampleResult }) {
  return (
    <div className="panel glass">
      <div className="panel-top">
        <span>Page atmosphere</span>
        <span className="live">live</span>
      </div>
      <p className="summary">{result.summary}</p>
      <div className="bars">
        {ATMOSPHERES.map((item) => (
          <div className="bar-row" key={item.key}>
            <div className="bar-label">
              <span className={`dot dot-${item.color}`} />
              <span>{item.label}</span>
              <strong>{result.mix[item.key] ?? 0}%</strong>
            </div>
            <div className="bar-track">
              <div className={`bar-fill fill-${item.color}`} style={{ width: `${result.mix[item.key] ?? 0}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="note">{result.note || "Atmosphere mix, not truth probability."}</p>
    </div>
  );
}

function ScanCard() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(sampleResult);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function scan(event) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn’t scan this page.");
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <section className="scan glass" id="scan">
      <div>
        <p className="eyebrow">Preview</p>
        <h2>Paste a URL. See its atmosphere.</h2>
        <p className="muted">Website scan is a public URL preview. The browser extension itself stays local while you browse.</p>
      </div>
      <form onSubmit={scan} className="scan-form">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/article" inputMode="url" required />
        <button type="submit" disabled={status === "loading"}>{status === "loading" ? "Reading…" : "Scan atmosphere"}</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <div className="scan-result">
        <AtmosphereOrb mix={result.mix} size="small" />
        <AtmospherePanel result={result} />
      </div>
    </section>
  );
}

function AtmosphereCard({ item }) {
  const copy = {
    neutralInfo: "Functional. Informational. Context-forward.",
    attentionHeavy: "Stimulating. Urgent. Engagement-oriented.",
    syntheticRhythm: "Templated. Generic. Optimization residue.",
    groundedPace: "Restorative. Human-paced. Low pressure."
  };
  return (
    <div className="atmo-card glass">
      <span className={`dot dot-${item.color}`} />
      <h3>{item.label}</h3>
      <p>{copy[item.key]}</p>
    </div>
  );
}

export default function Page() {
  const result = useMemo(() => sampleResult, []);
  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top"><span className="brand-dot" /> Tint</a>
        <div>
          <a href="#scan">Scan</a>
          <a href="https://github.com/tomasbatovsky-png/tint">GitHub</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Browser atmosphere layer</p>
          <h1>See the atmosphere of the internet.</h1>
          <p className="lead">Tint gives every page a live atmosphere mix — neutral info, attention-heavy, synthetic rhythm, and grounded pace.</p>
          <div className="cta-row">
            <a className="button primary" href="#scan">Scan a URL</a>
            <a className="button secondary" href="https://github.com/tomasbatovsky-png/tint">View on GitHub</a>
          </div>
          <p className="fine">No truth score. No blocking. No remote browsing telemetry.</p>
        </div>
        <div className="hero-demo">
          <AtmosphereOrb mix={result.mix} />
          <AtmospherePanel result={result} />
        </div>
      </section>

      <ScanCard />

      <section className="why">
        <p className="eyebrow">Why Tint exists</p>
        <h2>Your browser shows information. Tint shows atmosphere.</h2>
        <p>Modern pages are optimized for attention, rhythm, and pressure. Tint does not judge the content. It gives you a small local signal for the atmosphere you are entering.</p>
      </section>

      <section className="grid">
        {ATMOSPHERES.map(item => <AtmosphereCard item={item} key={item.key} />)}
      </section>

      <section className="privacy glass">
        <h2>Local-first by default.</h2>
        <p>The extension computes the page atmosphere in your browser. Page content does not leave your browser. The website scan is separate: you paste a public URL to preview its atmosphere.</p>
      </section>

      <footer>
        <span>Tint does not judge content. It reveals atmosphere.</span>
      </footer>
    </main>
  );
}
