'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, Loader2, UserPlus, RefreshCw, Trophy, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Download, X } from 'lucide-react';

export default function ComparePage() {
    const [data, setData] = useState({ trailblazers: [], certifications: [], relationships: [] });
    const [loading, setLoading] = useState(true);
    const [scrapingAlias, setScrapingAlias] = useState(null);
    const [newAlias, setNewAlias] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'cert', direction: 'asc' }); // key: 'cert', 'hold', or user index
    const [notifications, setNotifications] = useState([]);

    const showToast = (message, type = 'error') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const fetchData = async () => {
        try {
            const res = await fetch('/api/trailblazers');
            const result = await res.json();
            
            if (!res.ok) {
                console.error('API Error:', result);
                showToast(result.error || 'Failed to fetch trailblazers');
                setData({ trailblazers: [], certifications: [], relationships: [] });
                return;
            }
            
            setData({
                trailblazers: result.trailblazers || [],
                certifications: result.certifications || [],
                relationships: result.relationships || []
            });
        } catch (err) {
            console.error('Failed to fetch data', err);
            setData({ trailblazers: [], certifications: [], relationships: [] });
            showToast('Failed to fetch data (Server Error)');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddTrailblazer = async (e) => {
        e.preventDefault();
        if (!newAlias) return;

        setScrapingAlias(newAlias);
        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAlias: newAlias })
            });

            const result = await res.json();

            if (!res.ok) {
                showToast(result.error || 'Failed to add trailblazer');
                return;
            }

            setNewAlias('');
            await fetchData();
        } catch (err) {
            console.error('Error adding/scraping', err);
            showToast('An unexpected error occurred');
        } finally {
            setScrapingAlias(null);
        }
    };

    const handleRefreshAll = async () => {
        if (!!scrapingAlias) return;
        const total = data.trailblazers.length;
        if (total === 0) return;

        setScrapingAlias('Refetching all...');
        try {
            for (let i = 0; i < data.trailblazers.length; i++) {
                const tb = data.trailblazers[i];
                await fetch('/api/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userAlias: tb.alias })
                });
            }
            await fetchData();
        } catch (err) {
            console.error('Refresh all error', err);
            showToast('Failed to refresh some users');
        } finally {
            setScrapingAlias(null);
        }
    };

    const handleRefresh = async (alias) => {
        setScrapingAlias(alias);
        try {
            await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAlias: alias })
            });
            await fetchData();
        } catch (err) {
            console.error('Refresh error', err);
        } finally {
            setScrapingAlias(null);
        }
    };

    const [confirmDelete, setConfirmDelete] = useState(null);

    const handleRemove = async (id) => {
        try {
            await fetch('/api/trailblazers', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            await fetchData();
            setConfirmDelete(null);
        } catch (err) {
            console.error('Remove error', err);
        }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    const handleExportCSV = () => {
        if (!data.trailblazers.length) return;

        const headers = ['Certification', 'Category', 'Holder Count', ...data.trailblazers.map(t => t.name || t.alias)];
        const rows = data.certifications.map(cert => {
            const row = [
                cert.name,
                cert.topic,
                cert.holder_count || 0,
                ...data.trailblazers.map(tb => {
                    const rel = data.relationships.find(r => r.trailblazer_id === tb.id && r.certification_id === cert.id);
                    if (!rel) return '';
                    return rel.is_expired ? 'Expired' : 'Active';
                })
            ];
            return row.join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `salesforce_certifications_comparison_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const sortedCertifications = useMemo(() => {
        const certs = [...data.certifications];
        if (sortConfig.key === 'cert') {
            certs.sort((a, b) => {
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();
                if (nameA < nameB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (nameA > nameB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else if (sortConfig.key === 'hold') {
            certs.sort((a, b) => {
                const countA = a.holder_count || 0;
                const countB = b.holder_count || 0;
                if (countA === countB) return a.name.localeCompare(b.name);
                return sortConfig.direction === 'asc' ? countA - countB : countB - countA;
            });
        } else {
            // Sort by user's certification status (Active > Expired > None)
            const userId = sortConfig.key;
            const getVal = (cert) => {
                const r = data.relationships.find(rel => rel.trailblazer_id === userId && rel.certification_id === cert.id);
                if (!r) return 0;
                return r.is_expired ? 1 : 2;
            };

            certs.sort((a, b) => {
                const valA = getVal(a);
                const valB = getVal(b);
                if (valA === valB) return a.name.localeCompare(b.name);
                return sortConfig.direction === 'asc' ? valB - valA : valA - valB;
            });
        }
        return certs;
    }, [data.certifications, data.relationships, sortConfig]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-white text-slate-900">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                <p className="text-xl font-medium">Loading certification matrix...</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-white text-slate-900 p-8 pt-12">
            <div className="max-w-[1600px] mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 pb-8 border-b border-slate-100">
                    <div>
                        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
                            Trailblazer Certifications Overview
                        </h1>
                        <p className="text-slate-500 text-lg">Cross-comparison certification matrix for your Salesforce team.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRefreshAll}
                            disabled={!!scrapingAlias || data.trailblazers.length === 0}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all font-semibold disabled:opacity-50"
                            title="Refresh all trailblazer data"
                        >
                            {scrapingAlias === 'Refetching all...' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Refresh All
                        </button>

                        <button
                            onClick={handleExportCSV}
                            disabled={data.trailblazers.length === 0}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all font-semibold disabled:opacity-50"
                            title="Export matrix to CSV"
                        >
                            <Download className="w-4 h-4" />
                            Export CSV
                        </button>

                        <form onSubmit={handleAddTrailblazer} className="flex gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                            <input
                                type="text"
                                placeholder="Trailblazer Alias"
                                value={newAlias}
                                onChange={(e) => setNewAlias(e.target.value)}
                                className="bg-transparent border-none focus:ring-0 px-4 py-2 w-48 text-slate-800 placeholder-slate-400 font-medium"
                            />
                            <button
                                type="submit"
                                disabled={!!scrapingAlias}
                                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm transition-all flex items-center gap-2"
                            >
                                {scrapingAlias === newAlias ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Add User
                            </button>
                        </form>
                    </div>
                </header>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
                    <div className="overflow-x-auto overflow-y-hidden">
                        <table className="w-full border-separate border-spacing-0">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th
                                        onClick={() => handleSort('cert')}
                                        className="p-4 text-left border-b border-slate-200 w-[300px] min-w-[300px] cursor-pointer group sticky left-0 z-20 bg-slate-50/95 backdrop-blur-sm"
                                    >
                                        <div className="flex items-center gap-2 text-slate-400 uppercase tracking-wider text-[10px] font-bold transition-colors group-hover:text-blue-600">
                                            <Trophy className="w-3 h-3" /> Certification
                                            {sortConfig.key === 'cert' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                        </div>
                                    </th>
                                    {data.trailblazers.map(tb => (
                                        <th
                                            key={tb.id}
                                            className="p-4 text-center border-b border-slate-200 w-32 min-w-[128px] z-10 sticky top-0 bg-slate-50/50"
                                        >
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="flex flex-col items-center">
                                                    <span
                                                        className="font-bold text-slate-900 text-xs whitespace-normal break-words max-w-[110px] mx-auto text-center line-clamp-2 leading-tight h-8 flex items-center justify-center"
                                                        title={`${data.relationships.filter(r => r.trailblazer_id === tb.id).length} certifications`}
                                                    >
                                                        {tb.name || tb.alias}
                                                    </span>
                                                    <a
                                                        href={`/trailblazers/${tb.alias}`}
                                                        className="text-[9px] text-blue-500 hover:underline font-mono uppercase tracking-widest mt-0.5"
                                                    >
                                                        {tb.alias}
                                                    </a>
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleRefresh(tb.alias)}
                                                        disabled={!!scrapingAlias}
                                                        title="Refresh Data"
                                                        className="p-1.5 rounded-full hover:bg-blue-50 text-slate-300 hover:text-blue-600 transition-all"
                                                    >
                                                        {scrapingAlias === tb.alias ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                    </button>

                                                    <button
                                                        onClick={() => handleSort(tb.id)}
                                                        title="Sort by this User"
                                                        className={`p-1.5 rounded-full transition-all ${sortConfig.key === tb.id ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-slate-300 hover:text-blue-600'}`}
                                                    >
                                                        <ArrowUpDown className="w-3 h-3" />
                                                    </button>

                                                    {confirmDelete === tb.id ? (
                                                        <div className="flex items-center gap-1 bg-rose-50 rounded-full px-2 py-1 border border-rose-100 animate-in fade-in zoom-in duration-200">
                                                            <button
                                                                onClick={() => handleRemove(tb.id)}
                                                                className="text-rose-600 hover:text-rose-700 font-bold text-[10px] uppercase px-1"
                                                            >
                                                                Delete
                                                            </button>
                                                            <div className="w-[1px] h-3 bg-rose-200 mx-0.5" />
                                                            <button
                                                                onClick={() => setConfirmDelete(null)}
                                                                className="text-slate-400 hover:text-slate-600 px-1"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmDelete(tb.id)}
                                                            disabled={!!scrapingAlias}
                                                            title="Remove User"
                                                            className="p-1.5 rounded-full hover:bg-rose-50 text-slate-200 hover:text-rose-600 transition-all"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </th>
                                    ))}
                                    <th
                                        onClick={() => handleSort('hold')}
                                        className="p-4 text-center border-b border-slate-200 w-24 min-w-[96px] cursor-pointer group sticky top-0 bg-slate-50/50"
                                    >
                                        <div className="flex items-center justify-center gap-2 text-slate-400 uppercase tracking-wider text-xs font-bold transition-colors group-hover:text-blue-600">
                                            Holders
                                            {sortConfig.key === 'hold' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedCertifications.length === 0 ? (
                                    <tr>
                                        <td colSpan={data.trailblazers.length + 1} className="p-16 text-center text-slate-400">
                                            <Trophy className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                            <p className="text-lg italic">No certifications tracked yet.</p>
                                            <p className="text-sm">Add a trailblazer alias to begin mapping certifications.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    sortedCertifications.map((cert, idx) => (
                                        <tr
                                            key={cert.id}
                                            className="hover:bg-slate-50/80 transition-colors"
                                        >
                                            <td className="p-3 sticky left-0 z-10 bg-white border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                <div className="flex flex-col">
                                                    <a
                                                        href={`/certifications/${cert.id}`}
                                                        className="font-bold text-slate-800 text-xs leading-tight hover:text-blue-600 hover:underline decoration-blue-200 underline-offset-4"
                                                    >
                                                        {cert.name}
                                                    </a>
                                                </div>
                                            </td>
                                            {data.trailblazers.map(tb => {
                                                const rel = data.relationships.find(r => r.trailblazer_id === tb.id && r.certification_id === cert.id);
                                                return (
                                                    <td key={tb.id} className="p-2 text-center border-l border-slate-50">
                                                        {rel ? (
                                                            <div
                                                                title={`${tb.name || tb.alias} achieved this on ${rel.issue_date}`}
                                                                className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all hover:scale-110 cursor-help ${rel.is_expired === 1
                                                                    ? 'bg-orange-50 text-orange-400 border-orange-100'
                                                                    : 'bg-emerald-50 text-emerald-500 border-emerald-100'
                                                                    }`}
                                                            >
                                                                <Check className="w-4 h-4" strokeWidth={4} />
                                                            </div>
                                                        ) : (
                                                            <div className="w-2 h-2 rounded-full bg-slate-100 mx-auto" />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 text-center border-l border-slate-50">
                                                <div className="inline-flex items-center justify-center bg-slate-50 text-slate-500 text-[10px] font-black w-7 h-7 rounded-full border border-slate-100">
                                                    {cert.holder_count || 0}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table >
                    </div >
                </div >

                <footer className="mt-8 text-center">
                    <p className="text-slate-400 text-sm">
                        Data synchronized from public Salesforce Trailblazer profiles.
                    </p>
                </footer>

                {/* Toast Notifications */}
                <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-50">
                    {notifications.map(n => (
                        <div
                            key={n.id}
                            className={`px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 ${n.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${n.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                            <span className="font-medium">{n.message}</span>
                        </div>
                    ))}
                </div>
            </div >
        </main >
    );
}
