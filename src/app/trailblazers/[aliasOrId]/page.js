'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Award, Calendar, CheckCircle, Clock, ExternalLink, User, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';

export default function TrailblazerDetail() {
    const params = useParams();
    const router = useRouter();
    const [tb, setTb] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const res = await fetch(`/api/trailblazers/${params.aliasOrId}`);
                const data = await res.json();
                setTb(data);
            } catch (err) {
                console.error('Failed to fetch trailblazer detail:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchDetail();
    }, [params.aliasOrId]);

    const parseDate = (dateStr) => {
        if (!dateStr || dateStr === 'N/A') return new Date(0);
        // Handle ranges like "Oct 2018 - Apr 2019" by taking the start date
        const issuePart = dateStr.includes('-') ? dateStr.split('-')[0].trim() : dateStr.trim();
        const parts = issuePart.split(/\s+/);
        if (parts.length < 2) return new Date(0);

        const month = parts[0];
        const year = parts[parts.length - 1];
        const d = new Date(`${month} 1, ${year}`);
        return isNaN(d.getTime()) ? new Date(0) : d;
    };

    const sortedCertifications = useMemo(() => {
        if (!tb?.certifications) return [];
        const certs = [...tb.certifications];
        certs.sort((a, b) => {
            let valA, valB;
            if (sortConfig.key === 'date') {
                valA = parseDate(a.issue_date).getTime();
                valB = parseDate(b.issue_date).getTime();
            } else if (sortConfig.key === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sortConfig.key === 'status') {
                valA = a.is_expired ? 0 : 1;
                valB = b.is_expired ? 0 : 1;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return certs;
    }, [tb, sortConfig]);

    const lastIssueDate = useMemo(() => {
        if (!tb?.certifications || tb.certifications.length === 0) return 'N/A';
        const dates = tb.certifications.map(c => parseDate(c.issue_date));
        const maxDate = new Date(Math.max(...dates));
        return maxDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }, [tb]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    if (loading) return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );
    if (!tb) return <div className="min-h-screen bg-white p-8">Trailblazer not found</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <button
                onClick={() => router.back()}
                className="mb-8 flex items-center text-slate-500 hover:text-blue-600 transition-colors font-medium"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Comparison
            </button>

            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden mb-8">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-8 text-white">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-6">
                                <div className="relative">
                                    {(tb.picture || tb.profile_picture_url) ? (
                                        <img
                                            src={tb.picture || tb.profile_picture_url}
                                            alt={tb.name}
                                            className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white/20 shadow-lg"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.nextSibling.style.display = 'flex';
                                            }}
                                        />
                                    ) : null}
                                    <div className={`bg-white/20 p-6 rounded-2xl ring-4 ring-white/20 shadow-lg ${(tb.picture || tb.profile_picture_url) ? 'hidden' : 'flex'}`}>
                                        <User className="h-12 w-12" />
                                    </div>
                                </div>
                                <div>
                                    <h1 className="text-4xl font-black tracking-tight">{tb.name || tb.alias}</h1>
                                    <p className="text-blue-100/80 font-mono tracking-widest uppercase text-sm mt-1">@{tb.alias}</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={async () => {
                                        setScraping(true);
                                        try {
                                            await fetch('/api/scrape', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ userAlias: tb.alias })
                                            });
                                            const res = await fetch(`/api/trailblazers/${aliasOrId}`);
                                            const data = await res.json();
                                            if (data) setTb(data);
                                        } catch (err) {
                                            console.error('Refresh error', err);
                                        } finally {
                                            setScraping(false);
                                        }
                                    }}
                                    disabled={scraping}
                                    className="bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-all border border-white/10 hover:border-white/20 disabled:opacity-50"
                                    title="Refresh Data"
                                >
                                    <RefreshCw className={`h-6 w-6 ${scraping ? 'animate-spin' : ''}`} />
                                </button>
                                <a
                                    href={tb.profile_url || `https://www.salesforce.com/trailblazer/${tb.alias}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-all border border-white/10 hover:border-white/20"
                                    title="View Public Profile"
                                >
                                    <ExternalLink className="h-6 w-6" />
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center gap-4">
                                <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                                    <Award className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Certs</p>
                                    <p className="text-3xl font-black text-slate-900">{tb.certifications?.length || 0}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center gap-4">
                                <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
                                    <Calendar className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Last Issued</p>
                                    <p className="text-2xl font-black text-slate-900">{lastIssueDate}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black text-slate-900">Certifications</h2>
                            <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                                {sortedCertifications.length} Achievements
                            </span>
                        </div>

                        {sortedCertifications.length > 0 ? (
                            <div className="overflow-hidden border border-slate-100 rounded-2xl bg-slate-50/50">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/50">
                                            <th
                                                onClick={() => handleSort('name')}
                                                className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    Certification
                                                    {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                                </div>
                                            </th>
                                            <th
                                                onClick={() => handleSort('date')}
                                                className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    Issue Date
                                                    {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                                </div>
                                            </th>
                                            <th
                                                onClick={() => handleSort('status')}
                                                className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors text-right"
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Status
                                                    {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {sortedCertifications.map((cert, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col">
                                                        <a
                                                            onClick={() => router.push(`/certifications/${cert.certification_id}`)}
                                                            className="font-bold text-slate-800 hover:text-blue-700 transition-colors cursor-pointer"
                                                        >
                                                            {cert.name}
                                                        </a>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="text-[10px] text-blue-500 font-black uppercase tracking-widest">{cert.topic}</div>
                                                            {cert.cert_link && (
                                                                <a
                                                                    href={cert.cert_link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-slate-300 hover:text-slate-500 transition-colors"
                                                                    title="View Original Certificate"
                                                                >
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-sm text-slate-600 font-medium">
                                                    <div className="flex items-center">
                                                        {cert.issue_date.split('-')[0].trim()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    {cert.is_expired ? (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-lg bg-orange-50 text-orange-600 text-[10px] font-black uppercase tracking-widest border border-orange-100">
                                                            <Clock className="h-3 w-3 mr-1.5" />
                                                            Expired
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                                                            <CheckCircle className="h-3 w-3 mr-1.5" />
                                                            Active
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <Award className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                <p className="text-slate-400 font-medium italic">No public certifications found.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
