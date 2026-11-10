import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { ACCESS_LABELS, DEVICE_LABELS, DEVICES } from './domain.ts';
import type { Access, DatasetMode, Device, ModeOfTravel, RideFeatureProperties, Rule, Snapshot, Source } from './domain.ts';
import { evaluateRules } from './rules.ts';
import { formatPacific, pacificInput, resolvePacificInput } from './time.ts';
import { snapshotRepository } from './repository.ts';
import RideMap from './RideMap.tsx';

const emptyMap: FeatureCollection<GeoJSON.Geometry, RideFeatureProperties> = {
  type: 'FeatureCollection', features: [],
};
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const outcomes: Access[] = ['allowed', 'walk-device', 'prohibited', 'unverified'];
const kindLabels: Record<RideFeatureProperties['kind'], string> = {
  facility: 'Bike facility', restriction: 'Restriction', dismount: 'Dismount zone',
  closure: 'Closure', destination: 'Destination', parking: 'Parking',
};

function scheduleLabel(schedule: Rule['schedule']) {
  return schedule
    ? `${schedule.weekdays.map(day => weekdays[day]).join(', ')} · ${schedule.start}–${schedule.end} Pacific`
    : 'All hours during effective dates';
}

function Evidence({ source }: { source: Source }) {
  return <div className="evidence">
    {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> : <strong>{source.title}</strong>}
    <small>{source.authority} · {source.verifiedOn ? `Last verified ${source.verifiedOn}` : 'Verification pending or fictional'}</small>
  </div>;
}

function StateBadge({ access }: { access: Access }) {
  return <span className={`state state--${access}`}><i />{ACCESS_LABELS[access]}</span>;
}

function Speed({ label, value, unavailable }: { label: string; value?: number | null; unavailable?: string }) {
  return <div><dt>{label}</dt><dd>{value == null ? unavailable ?? 'Unknown' : `${value} mph`}</dd></div>;
}

function isSegment(feature: RideFeatureProperties) {
  return feature.kind !== 'parking' && feature.kind !== 'destination';
}

export default function App() {
  const [mode, setMode] = useState<DatasetMode>('irvine');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [device, setDevice] = useState<Device>('bicycle');
  const [travel, setTravel] = useState<ModeOfTravel>('ride');
  const [clock, setClock] = useState<'now' | 'departure'>('now');
  const [now, setNow] = useState(() => new Date());
  const [departure, setDeparture] = useState(() => pacificInput(new Date()));
  const departureInput = useRef<HTMLInputElement>(null);
  const [offsetIndex, setOffsetIndex] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'details' | 'quality'>('details');
  const [correction, setCorrection] = useState('');
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    snapshotRepository.load(mode, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setSnapshot(result);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    });
    return () => controller.abort();
  }, [mode, attempt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function switchMode(next: DatasetMode) {
    if (mode === next) return;
    setSnapshot(null);
    setLoadError(false);
    setSelectedId(null);
    setReportTarget(null);
    setCorrection('');
    setMode(next);
    setTab('details');
  }

  function select(id: string) {
    setSelectedId(id);
    setTab('details');
  }

  const possibleTimes = useMemo(() => resolvePacificInput(departure), [departure]);
  const instant = clock === 'now' ? now : possibleTimes.length === 1 ? possibleTimes[0] :
    offsetIndex === null ? null : possibleTimes[offsetIndex] ?? null;
  // Use the exact chosen instant for evaluation, including effective date boundaries.
  const evaluationTime = instant?.getTime() ?? null;
  const results = useMemo(() => {
    if (!snapshot || evaluationTime === null) return {};
    return Object.fromEntries(snapshot.features.features
      .filter(({ properties }) => isSegment(properties))
      .map(({ properties }) => [properties.id, evaluateRules(snapshot, properties.id, device, new Date(evaluationTime), travel)]));
  }, [snapshot, evaluationTime, device, travel]);
  const states = useMemo(() => Object.fromEntries(Object.entries(results).map(([id, result]) => [id, result.access])), [results]);
  const selected = snapshot?.features.features.find(feature => feature.properties.id === selectedId)?.properties;
  const result = selected ? results[selected.id] : undefined;
  const sources = new Map(snapshot?.sources.map(source => [source.id, source]));
  const selectedSource = selected?.provenance.sourceId ? sources.get(selected.provenance.sourceId) : undefined;

  function downloadCorrection() {
    const blob = new Blob([JSON.stringify({
      dataset: mode, version: snapshot?.version ?? null, target: reportTarget,
      device, travel, note: correction.trim(),
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ride-atlas-correction.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <header className="site-header">
      <div className="brand"><span className="brand-icon" aria-hidden="true">↗</span><span>Ride Atlas<small>UCI + IRVINE</small></span></div>
      <span className="milestone"><i /> MILESTONE 01</span>
    </header>
    <main>
      <section className="intro" aria-labelledby="title">
        <div><div className="eyebrow">CAMPUS MICROMOBILITY</div>
          <h1 id="title">Can I ride here?</h1>
          <p>Check access, restrictions, and speed ceilings by device and time.</p></div>
        <div className="switch" aria-label="Map dataset">
          <button aria-pressed={mode === 'irvine'} onClick={() => switchMode('irvine')}>Irvine context</button>
          <button aria-pressed={mode === 'demo'} onClick={() => switchMode('demo')}>Practice map</button>
        </div>
      </section>

      <section className="controls" aria-label="Ride settings">
        <label>Device<select value={device} onChange={event => setDevice(event.target.value as Device)}>
          {DEVICES.map(item => <option key={item} value={item}>{DEVICE_LABELS[item]}</option>)}
        </select></label>
        <label>Check access while<select value={travel} onChange={event => setTravel(event.target.value as ModeOfTravel)}>
          <option value="ride">Riding</option><option value="walk">Walking device</option>
        </select></label>
        <label>Time in Los Angeles<select value={clock} onChange={event => setClock(event.target.value as typeof clock)}>
          <option value="now">Current time</option><option value="departure">Selected departure</option>
        </select></label>
        {clock === 'departure' ? <div className="departure">
          <label>Local departure<input ref={departureInput} type="datetime-local" defaultValue={departure} /></label>
          <button className="secondary" onClick={() => {
            setDeparture(departureInput.current?.value ?? '');
            setOffsetIndex(null);
          }}>Apply time</button>
        </div>
          : <div className="clock"><span className="field-label">America/Los_Angeles</span><time dateTime={now.toISOString()}>{formatPacific(now)}</time></div>}
        {clock === 'departure' && instant && <p className="applied-time">Checking {formatPacific(instant)}</p>}
        {clock === 'departure' && possibleTimes.length === 0 && <p className="control-error" role="alert">Enter a valid Los Angeles time. During the spring clock change, some local times do not exist.</p>}
        {clock === 'departure' && possibleTimes.length === 2 && <label className="fold">This time occurs twice<select value={offsetIndex ?? ''} onChange={event => setOffsetIndex(event.target.value === '' ? null : Number(event.target.value))}>
          <option value="">Choose which occurrence</option>{possibleTimes.map((time, index) =>
            <option key={time.toISOString()} value={index}>{index === 0 ? 'First' : 'Second'} · {formatPacific(time)} · {time.toISOString().slice(11, 16)} UTC</option>)}
        </select></label>}
      </section>

      <div className={`coverage ${mode === 'demo' ? 'coverage--demo' : ''}`}>
        <strong>{mode === 'demo' ? 'Fictional training data' : 'Coverage in review'}</strong>
        <span>{mode === 'demo' ? 'Invented geometry and rules for testing. Never use this view to make a real ride decision.' :
          'The basemap is geographic context. Segment access and speed coverage are pending review.'}</span>
      </div>
      <div className="workspace">
        <section className="map-card" aria-label="Map and legend">
          <div className="map-heading"><span>{mode === 'irvine' ? 'UC Irvine & surroundings' : 'Fictional practice network'}</span><small>{snapshot ? `DATA ${snapshot.version}` : 'DATA PENDING'}</small></div>
          <div className="map-frame"><RideMap key={mode} mode={mode} features={snapshot?.features ?? emptyMap} states={states}
            selectedId={selectedId} onSelect={select} /></div>
          <div className="legend" aria-label="Access legend">{outcomes.map(access => <StateBadge key={access} access={access} />)}</div>
          {snapshot && snapshot.features.features.length > 0 && <div className="feature-picker"><label>Find a feature<select value={selectedId ?? ''} onChange={event => select(event.target.value)}>
            <option value="">Choose a segment or place</option>{snapshot.features.features.map(({properties: feature}) =>
              <option key={feature.id} value={feature.id}>{kindLabels[feature.kind]} · {feature.name}</option>)}
          </select></label></div>}
        </section>
        <aside className="inspector" aria-label="Map information">
          <div className="tabs" aria-label="Information view">
            <button aria-pressed={tab === 'details'} onClick={() => setTab('details')}>Segment details</button>
            <button aria-pressed={tab === 'quality'} onClick={() => setTab('quality')}>Data quality {snapshot ? `(${snapshot.issues.length})` : ''}</button>
          </div>
          <div className="panel">
            {loadError ? <div role="alert"><h2>Data could not load</h2><p>Try reloading this snapshot.</p><button className="primary" onClick={() => { setLoadError(false); setAttempt(value => value + 1); }}>Retry data</button></div>
              : !snapshot ? <p role="status">Loading dataset…</p>
              : tab === 'quality' ? <><div className="eyebrow">REVIEW QUEUE</div><h2>Data quality</h2>
                <p>{mode === 'irvine' ? 'Published guidance is catalogued here while geographic applicability is reviewed.' : 'These issues illustrate how unknowns and conflicts are surfaced.'}</p>
                {snapshot.issues.length === 0 && <p>No open issues in this snapshot.</p>}
                {snapshot.issues.map(issue => <article className="issue" key={issue.id}>
                  <span className={`issue-tag issue-tag--${issue.status}`}>{issue.status}</span><h3>{issue.title}</h3><p>{issue.detail}</p>
                  {issue.sourceIds.map(id => { const source = sources.get(id); return source && <Evidence key={id} source={source} />; })}
                </article>)}</>
              : !selected ? <><div className="eyebrow">ACCESS CHECK</div><h2>{mode === 'irvine' ? 'Segment coverage pending' : 'Choose a feature'}</h2>
                <p>{mode === 'irvine' ? 'Verified overlays require reusable geometry and rules matched to each facility. View the review queue or try a fictional segment.' : 'Tap a line, zone, or marker on the map, or use the feature picker.'}</p>
                {mode === 'irvine' && <div className="action-row"><button className="primary" onClick={() => switchMode('demo')}>Open practice map</button><button className="secondary" onClick={() => setTab('quality')}>View gaps</button></div>}
              </> : <><div className="eyebrow">{kindLabels[selected.kind]} · {mode === 'demo' ? 'FICTIONAL' : 'IRVINE'}</div><h2>{selected.name}</h2>
                {isSegment(selected) && <><div aria-live="polite"><StateBadge access={result?.access ?? 'unverified'} />
                  <p>{result?.explanation ?? 'Choose a valid departure time to evaluate this segment.'}</p></div>
                  <dl className="speeds">
                    <Speed label="Rider ceiling" value={result?.riderSpeedMph} unavailable={result?.access === 'walk-device' || result?.access === 'prohibited' ? 'No riding' : travel === 'walk' ? 'Walking' : undefined} />
                    <Speed label="Roadway limit" value={selected.roadwaySpeedMph} />
                    <Speed label="Estimated travel" value={selected.expectedSpeedMph} />
                  </dl></>}
                <p className="provenance"><strong>Geometry provenance</strong><br />{selected.provenance.method}{selected.provenance.details ? ` · ${selected.provenance.details}` : ''}</p>
                {selectedSource && <Evidence source={selectedSource} />}
                {result?.relatedRules.map(rule => <article className="rule" key={rule.id}>
                  <span className="issue-tag">{result.rules.some(active => active.id === rule.id) ? 'Active' : 'Inactive'} · {rule.status}</span>
                  <h3>{scheduleLabel(rule.schedule)}</h3><p>{rule.explanation}</p>
                  {(rule.effective?.from || rule.effective?.to) && <p>Effective from {rule.effective.from ?? 'unspecified'} until {rule.effective.to ?? 'unspecified'}.</p>}
                  {rule.exceptions?.map((exception, index) => <p key={index}>Exception · {scheduleLabel(exception)}</p>)}
                  {rule.sourceIds.map(id => { const source = sources.get(id); return source && <Evidence key={id} source={source} />; })}
                </article>)}</>}
          </div>
        </aside>
      </div>

      <section className="corrections" aria-label="Corrections">
        <details onToggle={event => { if (event.currentTarget.open) setReportTarget(selectedId); }}>
          <summary>Report a correction</summary>
          <p>Describe a missing facility, incorrect rule, or posted sign. Download a report to share with the map maintainer.</p>
          <label>Report target<select value={reportTarget ?? ''} onChange={event => setReportTarget(event.target.value || null)}>
            <option value="">General dataset issue</option>{snapshot?.features.features.map(({properties}) => <option key={properties.id} value={properties.id}>{properties.name}</option>)}
          </select></label>
          <label>Correction details<textarea rows={3} maxLength={2000} value={correction} onChange={event => setCorrection(event.target.value)} placeholder="Describe what should change and include a source link if available." /></label>
          <button className="primary" disabled={!correction.trim()} onClick={downloadCorrection}>Download correction report</button>
          <small>Reports stay in this browser session until you download them. The app does not request your location.</small>
        </details>
      </section>
      <footer><span>Ride Atlas · UCI + Irvine</span><span>Pacific time · Milestone 01</span></footer>
    </main>
  </>;
}
