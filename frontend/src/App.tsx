import { useCallback, useEffect, useMemo } from 'react';
import { t } from './i18n';
import { useAppStore } from './state/appStore';
import { assistantStore, useAssistantStore } from './state/assistantStore';
import { TransmissionLine } from './ui/TransmissionLine';
import { filterEvents, historyStore, useHistoryStore, type View } from './state/historyStore';
import { eventStore, recorder } from './state/services';
import { EventSheet } from './ui/EventSheet';
import { HistoryView } from './ui/HistoryView';
import { MicIndicator } from './ui/MicIndicator';
import { ViewTabs } from './ui/ViewTabs';
import { AnomalyGauge } from './ui/AnomalyGauge';
import { ClassifierSwitch } from './ui/ClassifierSwitch';
import { ConsentScreen } from './ui/ConsentScreen';
import { DemoPicker } from './ui/DemoPicker';
import { LevelMeter } from './ui/LevelMeter';
import { LiveLabels } from './ui/LiveLabels';
import { MainScreen } from './ui/MainScreen';
import { ModelStatus } from './ui/ModelStatus';
import { Spectrogram } from './ui/Spectrogram';

export function App() {
  const status = useAppStore((s) => s.status);
  const source = useAppStore((s) => s.source);
  const errorKind = useAppStore((s) => s.errorKind);
  const model = useAppStore((s) => s.model);
  const live = useAppStore((s) => s.live);
  const lastSample = useAppStore((s) => s.lastSample);
  const analyser = useAppStore((s) => s.session?.analyser ?? null);
  const requestCapture = useAppStore((s) => s.requestCapture);
  const requestDemo = useAppStore((s) => s.requestDemo);
  const playSample = useAppStore((s) => s.playSample);
  const pause = useAppStore((s) => s.pause);
  const resume = useAppStore((s) => s.resume);
  const stop = useAppStore((s) => s.stop);
  const classifier = useAppStore((s) => s.classifier);
  const setClassifier = useAppStore((s) => s.setClassifier);
  const calibration = useAppStore((s) => s.calibration);
  const anomaly = useAppStore((s) => s.anomaly);
  const drift = useAppStore((s) => s.drift);
  const alerts = useAppStore((s) => s.alerts);
  const recalibrate = useAppStore((s) => s.recalibrate);
  const sessionActive = useAppStore((s) => s.session !== null);

  const view = useHistoryStore((s) => s.view);
  const events = useHistoryStore((s) => s.events);
  const sessions = useHistoryStore((s) => s.sessions);
  const loaded = useHistoryStore((s) => s.loaded);
  const historyError = useHistoryStore((s) => s.error);
  const filters = useHistoryStore((s) => s.filters);
  const selectedId = useHistoryStore((s) => s.selectedId);
  const { select, setView, setFilters, updateNote, clearAll, load } = historyStore.getState();
  const dialog = useAssistantStore((s) => s.dialog);
  const backend = useAssistantStore((s) => s.backend);
  const voice = useAssistantStore((s) => s.voice);
  const dictation = useAssistantStore((s) => s.dictation);
  const { submit, dictate, setVoice, wake } = assistantStore.getState();

  // Réveil du backend gratuit dès l'ouverture (démarrage à froid de plusieurs dizaines de secondes).
  useEffect(() => {
    void wake();
  }, [wake]);

  // Historique : chargement au démarrage, vue synchronisée avec l'adresse (#historique).
  useEffect(() => {
    void load();
    const fromHash = () => {
      setView(window.location.hash === '#historique' ? 'history' : 'listen');
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => {
      window.removeEventListener('hashchange', fromHash);
    };
  }, [load, setView]);

  // Les sessions créées depuis le chargement (et leur courbe) apparaissent dans l'historique.
  useEffect(() => {
    if (view === 'history') void load();
  }, [view, load]);

  const changeView = useCallback((next: View) => {
    window.location.hash = next === 'history' ? 'historique' : '';
  }, []);

  const sessionId = recorder.session;
  const sessionEvents = useMemo(
    () => (sessionId ? events.filter((e) => e.sessionId === sessionId) : []),
    [events, sessionId],
  );
  const filtered = useMemo(() => filterEvents(events, filters), [events, filters]);
  const selected = events.find((e) => e.id === selectedId) ?? null;
  const loadScores = useCallback((id: string) => eventStore.scoreSeries(id), []);

  const download = (format: 'json' | 'csv') => {
    const state = historyStore.getState();
    const body = format === 'json' ? state.exportJson() : state.exportCsv();
    const blob = new Blob([format === 'csv' ? `\ufeff${body}` : body], {
      type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soundguard-historique.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = <ViewTabs view={view} onChange={changeView} />;
  const sheet = (
    <EventSheet
      event={selected}
      clip={selected ? (recorder.clips.get(selected.id) ?? null) : null}
      onClose={() => {
        select(null);
      }}
      onSaveNote={updateNote}
    />
  );

  if (view === 'history') {
    return (
      <div className="sg-main sg-main--history">
        <header className="sg-statusbar">
          <p className="sg-statusbar__brand">
            <span className="sg-statusbar__name">{t.app.name}</span>
          </p>
          {tabs}
          {sessionActive && <MicIndicator paused={status === 'paused'} demo={source === 'demo'} />}
        </header>
        <HistoryView
          loaded={loaded}
          error={historyError}
          events={filtered}
          allEvents={events}
          sessions={sessions}
          filters={filters}
          onFilters={setFilters}
          onSelect={select}
          onExport={download}
          onClear={clearAll}
          loadScores={loadScores}
        />
        {sheet}
      </div>
    );
  }

  if (status === 'idle' || status === 'consent' || status === 'error') {
    return (
      <ConsentScreen
        pending={status === 'consent'}
        errorKind={errorKind}
        onAccept={() => void requestCapture()}
        onDemo={() => void requestDemo()}
        nav={tabs}
      />
    );
  }

  const running = status === 'monitoring' || status === 'calibrating';
  const anomalyAvailable = model.status !== 'error' && model.info?.anomaly !== false;
  const demo = source === 'demo';
  return (
    <>
      <MainScreen
        status={status}
        demo={demo}
        model={<ModelStatus model={model} />}
        level={<LevelMeter analyser={analyser} running={running} />}
        spectrogram={<Spectrogram analyser={analyser} running={running} />}
        live={<LiveLabels live={live} />}
        anomaly={
          <AnomalyGauge
            status={status}
            available={anomalyAvailable}
            calibration={calibration}
            anomaly={anomaly}
            drift={drift}
            alerts={alerts}
            onRecalibrate={recalibrate}
          />
        }
        controls={
          <>
            {tabs}
            <ClassifierSwitch
              classifier={classifier}
              onChange={(kind) => void setClassifier(kind)}
            />
          </>
        }
        events={sessionEvents}
        onSelectEvent={select}
        transmission={
          <TransmissionLine
            dialog={dialog}
            backend={backend}
            voice={voice}
            dictation={dictation}
            onSubmit={submit}
            onDictate={() => void dictate()}
            onVoice={setVoice}
          />
        }
        calibration={status === 'calibrating' ? calibration.progress : null}
        demoPicker={
          demo ? (
            <DemoPicker
              current={lastSample?.id ?? null}
              disabled={!running}
              onPlay={(id) => void playSample(id)}
            />
          ) : null
        }
        onPause={() => void pause()}
        onResume={() => void resume()}
        onStop={() => void stop()}
      />
      {sheet}
    </>
  );
}
