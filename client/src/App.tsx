import { useState } from 'react';
import axios, { type AxiosError } from 'axios';
import SearchBar from './components/SearchBar';
import AISection, { type AdRecord } from './AISection';

const api = axios.create({ baseURL: 'https://ad-intel-api.onrender.com/api' });

function getApiErrorMessage(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ message?: string }>;
  const fromServer = ax?.response?.data?.message;
  return typeof fromServer === 'string' && fromServer.trim() ? fromServer.trim() : fallback;
}

type Competitor = { name: string; reason: string };
type ClusterConcept = { title: string; reason: string; adIds: string[] };

function App() {
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [activeBrand, setActiveBrand] = useState('');
  const [brandHistory, setBrandHistory] = useState<string[]>([]);
  const [noResultsMessage, setNoResultsMessage] = useState('No ads found. Try a different search term.');

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [askingAi, setAskingAi] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [competitorsError, setCompetitorsError] = useState<string | null>(null);
  const [isClusteredView, setIsClusteredView] = useState(false);
  const [clusteredConcepts, setClusteredConcepts] = useState<ClusterConcept[]>([]);
  const [clusteringLoading, setClusteringLoading] = useState(false);
  const [clusteringError, setClusteringError] = useState<string | null>(null);

  type FetchAdsApiResponse = { success?: boolean; data?: AdRecord[]; message?: string };
  type AskAdsApiResponse = { answer?: string };
  type CompetitorsApiResponse = { competitors?: Competitor[] };
  type ClusterApiResponse = { concepts?: ClusterConcept[] };

  const resetAiState = () => {
    setAiQuestion('');
    setAiAnswer('');
    setAiError(null);
    setAskingAi(false);
    setCompetitors([]);
    setCompetitorsLoading(false);
    setCompetitorsError(null);
    setIsClusteredView(false);
    setClusteredConcepts([]);
    setClusteringLoading(false);
    setClusteringError(null);
  };

  const handleSearch = async (query: string) => {
    const nextBrand = query.trim();
    if (!nextBrand) return;

    setBrandHistory((prev) => {
      if (!prev.length) return [nextBrand];
      const normalizedNext = nextBrand.toLowerCase();
      const last = prev[prev.length - 1];
      if (last.toLowerCase() === normalizedNext) return prev;
      const existingIndex = prev.findIndex((brand) => brand.toLowerCase() === normalizedNext);
      if (existingIndex !== -1) return prev.slice(0, existingIndex + 1);
      return [...prev, nextBrand].slice(-8);
    });

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setSearchInput(nextBrand);
    setActiveBrand(nextBrand);
    setAds([]);
    setNoResultsMessage('No ads found. Try a different search term.');
    resetAiState();

    try {
      const { data: fetchResponse } = await api.post<FetchAdsApiResponse>('/fetch-ads', { query: nextBrand, limit: 50 });
      setAds(fetchResponse.data ?? []);
      if (Array.isArray(fetchResponse.data) && fetchResponse.data.length === 0) {
        setNoResultsMessage(
          fetchResponse.message || 'No official ads found for this brand. Try a more specific variation.'
        );
      }
    } catch (err: unknown) {
      const rawMessage = getApiErrorMessage(err, 'We could not fetch ads right now. Please try again.');
      const message = /did not finish in time|timed out|taking longer than usual/i.test(rawMessage)
        ? 'Meta is taking longer than usual to respond. Please try one more time.'
        : rawMessage;
      setError(message);
      setAds([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAskAi = async () => {
    if (!activeBrand || !aiQuestion.trim()) return;
    setAskingAi(true);
    setAiError(null);
    setAiAnswer('');
    try {
      const { data: askResponse } = await api.post<AskAdsApiResponse>('/ads/ask', {
        brandName: activeBrand,
        userQuestion: aiQuestion.trim(),
      });
      setAiAnswer(askResponse.answer || '');
    } catch (err: unknown) {
      setAiError(getApiErrorMessage(err, 'Ask AI is unavailable right now. Please try again.'));
    } finally {
      setAskingAi(false);
    }
  };

  const handleFindCompetitors = async () => {
    if (!activeBrand.trim()) return;
    setCompetitorsLoading(true);
    setCompetitorsError(null);
    setCompetitors([]);
    try {
      const { data: competitorsResponse } = await api.post<CompetitorsApiResponse>('/ads/competitors', {
        brandName: activeBrand.trim(),
      });
      setCompetitors(Array.isArray(competitorsResponse.competitors) ? competitorsResponse.competitors : []);
    } catch (err: unknown) {
      setCompetitorsError(getApiErrorMessage(err, 'Could not load competitors right now. Please try again.'));
    } finally {
      setCompetitorsLoading(false);
    }
  };

  const handleClusterView = async () => {
    if (!activeBrand.trim() || !Array.isArray(ads) || ads.length === 0) return;

    if (isClusteredView) {
      setIsClusteredView(false);
      return;
    }

    if (clusteredConcepts.length > 0) {
      setIsClusteredView(true);
      return;
    }

    setClusteringLoading(true);
    setClusteringError(null);
    try {
      const { data: clusterResponse } = await api.post<ClusterApiResponse>('/ads/cluster', {
        brandName: activeBrand.trim(),
        ads: ads.map((a) => ({
          _id: a._id,
          text: a.text,
          platform: a.platform,
          platforms: a.platforms,
          imageUrl: a.imageUrl,
        })),
      });
      const concepts = Array.isArray(clusterResponse.concepts) ? clusterResponse.concepts : [];
      setClusteredConcepts(concepts);
      setIsClusteredView(concepts.length > 0);
      if (!concepts.length) {
        setClusteringError('No clusters were returned. Try again.');
      }
    } catch (err: unknown) {
      setClusteringError(getApiErrorMessage(err, 'Failed to cluster ads. Please try again.'));
      setIsClusteredView(false);
    } finally {
      setClusteringLoading(false);
    }
  };

  const hasLoadedResults = hasSearched && !loading && !error && ads.length > 0;
  const shouldShowBrandStatus = hasSearched && activeBrand && (loading || hasLoadedResults);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="text-3xl font-bold text-blue-700">Upspring Ad Search</h1>
          <p className="mt-1 text-sm text-gray-500">Search and discover ads across platforms</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <SearchBar
          onSearch={handleSearch}
          loading={loading}
          value={searchInput}
          onValueChange={setSearchInput}
        />

        {shouldShowBrandStatus && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Current Brand</p>
            <h2 className="mt-1 text-2xl font-extrabold text-blue-900">
              {loading ? `Searching for "${activeBrand}" ads...` : `Showing ads for: "${activeBrand}"`}
            </h2>
            {brandHistory.length > 1 && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">History</p>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                  {brandHistory.map((brand, index) => {
                    const isActive = index === brandHistory.length - 1;
                    return (
                      <span key={`${brand}-${index}`} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => handleSearch(brand)}
                          disabled={loading || isActive}
                          className={`rounded px-1.5 py-0.5 font-medium ${
                            isActive
                              ? 'cursor-default bg-blue-100 text-blue-900'
                              : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900'
                          } disabled:opacity-100`}
                        >
                          {brand}
                        </button>
                        {index < brandHistory.length - 1 && <span className="mx-1 text-blue-400">{'>'}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {hasSearched && !loading && !error && ads.length === 0 && (
          <p className="text-center text-gray-400 py-12">{noResultsMessage}</p>
        )}

        {hasLoadedResults && (
          <AISection
            key={activeBrand}
            activeBrand={activeBrand}
            ads={ads}
            loading={loading}
            onSelectBrandForSearch={handleSearch}
            aiQuestion={aiQuestion}
            onAiQuestionChange={setAiQuestion}
            onAskAi={handleAskAi}
            askingAi={askingAi}
            aiAnswer={aiAnswer}
            aiError={aiError}
            onFindCompetitors={handleFindCompetitors}
            competitors={competitors}
            competitorsLoading={competitorsLoading}
            competitorsError={competitorsError}
            onClusterToggle={handleClusterView}
            isClusteredView={isClusteredView}
            clusteringLoading={clusteringLoading}
            clusteringError={clusteringError}
            clusteredConcepts={clusteredConcepts}
          />
        )}
      </main>
    </div>
  );
}

export default App;
