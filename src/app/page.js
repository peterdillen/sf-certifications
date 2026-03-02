'use client';

import { useState } from 'react';
import { Search, Award, AlertCircle, Loader2, CheckCircle } from 'lucide-react';

export default function Home() {
  const [alias, setAlias] = useState('');
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCerts = async () => {
    if (!alias) return;
    setLoading(true);
    setError(null);
    setCerts([]);

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAlias: alias }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch certifications');
      }

      setCerts(data.certifications);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f4f7] text-[#032d60] font-sans">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 py-4 px-8 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-[#00a1e0] p-1.5 rounded-lg">
            <Award className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Trailblazer Certifications</h1>
        </div>
        <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">
          Scraper Tool
        </div>
      </nav>

      <div className="max-w-5xl mx-auto py-12 px-6">
        {/* Search Section */}
        <section className="bg-white rounded-2xl shadow-xl p-8 mb-10 transition-all duration-300 hover:shadow-2xl border border-gray-100">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Fetch User Credentials</h2>
            <p className="text-gray-500">Enter a Salesforce Trailblazer alias to retrieve their public certifications.</p>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00a1e0] transition-colors duration-300" />
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. pdillen or pierrevalentin"
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-[#00a1e0] focus:bg-white outline-none transition-all duration-300 text-lg"
                onKeyDown={(e) => e.key === 'Enter' && fetchCerts()}
              />
            </div>
            <button
              onClick={fetchCerts}
              disabled={loading || !alias}
              className="px-8 py-4 bg-[#00a1e0] hover:bg-[#0081b5] disabled:bg-gray-300 text-white font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#00a1e0]/30 min-w-[200px]"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" />
                  Fetching...
                </>
              ) : (
                'Get Certificates'
              )}
            </button>
          </div>
        </section>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-xl mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-4 text-red-700">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-lg leading-6">Action Failed</h3>
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {certs.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-extrabold flex items-center gap-3">
                <CheckCircle className="text-green-500 w-7 h-7" />
                Found {certs.length} Certifications
              </h2>
              <div className="text-sm font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                Alias: @{alias}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-8 py-5 text-left text-sm font-bold uppercase tracking-wider text-gray-400">Topic</th>
                    <th className="px-8 py-5 text-left text-sm font-bold uppercase tracking-wider text-gray-400">Certification Name</th>
                    <th className="px-8 py-5 text-right text-sm font-bold uppercase tracking-wider text-gray-400">Issue Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {certs.map((cert, index) => (
                    <tr key={index} className="hover:bg-blue-50/30 transition-colors duration-200 group">
                      <td className="px-8 py-6">
                        <span className="inline-block px-3 py-1 bg-[#00a1e0]/10 text-[#00a1e0] text-xs font-bold rounded-full border border-[#00a1e0]/20">
                          {cert.topic}
                        </span>
                      </td>
                      <td className="px-8 py-6 font-bold text-lg group-hover:text-[#00a1e0] transition-colors">{cert.name}</td>
                      <td className="px-8 py-6 text-right text-gray-500 tabular-nums font-medium">{cert.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-gray-400 text-sm italic text-center">Data fetched from the public Trailblazer profile.</p>
          </div>
        )}

        {/* Initial/Empty State */}
        {!loading && certs.length === 0 && !error && (
          <div className="text-center py-20 opacity-40">
            <Award className="w-20 h-20 mx-auto mb-4 text-gray-300" />
            <p className="text-xl font-medium">Search for an alias to see certificates</p>
          </div>
        )}
      </div>

      <footer className="py-8 text-center text-gray-400 text-xs mt-auto">
        &copy; 2026 Trailblazer Scraper Tool &bull; Powered by Next.js & Puppeteer
      </footer>
    </main>
  );
}
