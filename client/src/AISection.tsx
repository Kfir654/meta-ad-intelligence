import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import AdCard from './components/AdCard';

const QUICK_SUGGESTIONS = [
  'Analyze patterns',
  'Identify target audience',
  'What messaging angles are used most?',
  'What emotional triggers appear repeatedly?',
];

export type AdRecord = {
  _id?: string;
  brandName?: string;
  text?: string;
  imageUrl?: string | null;
  platform?: string;
  platforms?: string[];
  pageVerification?: string | null;
};

type Competitor = { name: string; reason: string };

type ClusterConcept = { title: string; reason: string; adIds: string[] };

type AISectionProps = {
  activeBrand: string;
  ads: AdRecord[];
  loading: boolean;
  onSelectBrandForSearch: (brand: string) => void;
  aiQuestion: string;
  onAiQuestionChange: (q: string) => void;
  onAskAi: () => void;
  askingAi: boolean;
  aiAnswer: string;
  aiError: string | null;
  onFindCompetitors: () => void;
  competitors: Competitor[];
  competitorsLoading: boolean;
  competitorsError: string | null;
  onClusterToggle: () => void;
  isClusteredView: boolean;
  clusteringLoading: boolean;
  clusteringError: string | null;
  clusteredConcepts: ClusterConcept[];
};

export default function AISection({
  activeBrand,
  ads,
  loading,
  onSelectBrandForSearch,
  aiQuestion,
  onAiQuestionChange,
  onAskAi,
  askingAi,
  aiAnswer,
  aiError,
  onFindCompetitors,
  competitors,
  competitorsLoading,
  competitorsError,
  onClusterToggle,
  isClusteredView,
  clusteringLoading,
  clusteringError,
  clusteredConcepts,
}: AISectionProps) {
  const adsById = useMemo(() => new Map(ads.map((ad) => [String(ad._id), ad])), [ads]);

  const conceptBuckets = useMemo(() => {
    return clusteredConcepts
      .map((concept) => {
        const conceptAds = (Array.isArray(concept.adIds) ? concept.adIds : [])
          .map((id) => adsById.get(String(id)))
          .filter((adRecord): adRecord is AdRecord => Boolean(adRecord));
        return {
          title: concept.title,
          reason: concept.reason,
          ads: conceptAds,
        };
      })
      .filter((conceptBucket) => conceptBucket.title && conceptBucket.reason && conceptBucket.ads.length > 0);
  }, [clusteredConcepts, adsById]);

  return (
    <>
      <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-4">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">AI Feature</p>
            <h2 className="text-base font-semibold text-violet-900">AI Strategy Insights</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onAiQuestionChange(suggestion)}
                className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => onAiQuestionChange(e.target.value)}
              placeholder="Ask AI about this brand's ads..."
              className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none ring-violet-300 placeholder:text-gray-400 focus:ring-2"
            />
            <button
              type="button"
              onClick={onAskAi}
              disabled={askingAi || loading || !activeBrand || !aiQuestion.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </div>

        </div>

        {competitorsError && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {competitorsError}
          </p>
        )}

        {aiError && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>
        )}

        {clusteringError && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {clusteringError}
          </p>
        )}

        {(askingAi || competitorsLoading || clusteringLoading) && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm text-violet-700 shadow-sm">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
            <span>
              {competitorsLoading
                ? 'Finding competitors…'
                : clusteringLoading
                  ? 'AI is grouping creatives by concept…'
                  : 'AI is thinking...'}
            </span>
          </div>
        )}

        {aiAnswer && (
          <div className="mt-3 rounded-lg border border-violet-200 bg-white px-4 py-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-violet-500">AI Insights</p>
            <div
              className="max-w-none text-sm text-gray-800 [&_a]:text-violet-700 [&_a]:underline [&_b]:font-bold [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p]:leading-relaxed [&_strong]:font-bold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
            >
              <ReactMarkdown>{aiAnswer}</ReactMarkdown>
            </div>
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={onFindCompetitors}
            disabled={competitorsLoading || loading || !activeBrand.trim()}
            className="inline-flex items-center justify-center rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{competitorsLoading ? 'Finding Competitors…' : 'Find Competitors'}</span>
          </button>
        </div>

        {competitors.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-violet-100 bg-white/80 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Why these competitors?</p>
              <p className="mt-1 text-xs text-gray-600">
                The model weighed general market positioning together with snippets from this brand&apos;s stored ad
                copy to suggest close rivals you may want to explore next.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {competitors.map((c) => (
                <li key={c.name} className="rounded-lg border border-violet-200 bg-white p-3 shadow-sm">
                  <button
                    type="button"
                    onClick={() => onSelectBrandForSearch(c.name)}
                    className="text-left text-sm font-semibold text-violet-800 underline decoration-violet-300 decoration-2 underline-offset-2 hover:text-violet-950"
                  >
                    {c.name}
                  </button>
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">{c.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!loading && !isClusteredView && ads.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {ads.length} result{ads.length !== 1 ? 's' : ''} found
            </p>
            <button
              type="button"
              onClick={onClusterToggle}
              disabled={loading || askingAi || clusteringLoading || ads.length === 0}
              className="inline-flex items-center justify-center rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {clusteringLoading ? 'Grouping…' : 'Group by Concept'}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ads.map((ad) => (
              <AdCard key={ad._id} ad={ad} />
            ))}
          </div>
        </>
      )}

      {!loading && isClusteredView && ads.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {ads.length} result{ads.length !== 1 ? 's' : ''} found
            </p>
            <button
              type="button"
              onClick={onClusterToggle}
              disabled={loading || askingAi || clusteringLoading || ads.length === 0}
              className="inline-flex items-center justify-center rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Back to List View
            </button>
          </div>
          {conceptBuckets.map((concept) => (
            <section key={concept.title} className="space-y-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-extrabold text-blue-900">{concept.title}</h3>
                  <span className="rounded-full border border-blue-300 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {concept.ads.length} ad{concept.ads.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="mt-1 text-sm text-blue-800">{concept.reason}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {concept.ads.map((ad) => (
                  <AdCard key={ad._id} ad={ad} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
