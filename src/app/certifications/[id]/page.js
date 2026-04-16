'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Award, Calendar, CheckCircle, Clock, Users, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function CertificationDetail() {
    const params = useParams();
    const router = useRouter();
    const [cert, setCert] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const res = await fetch(`/api/certifications/${params.id}`);
                const data = await res.json();
                setCert(data);
            } catch (err) {
                console.error('Failed to fetch cert detail:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchDetail();
    }, [params.id]);

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

    const sortedHolders = useMemo(() => {
        if (!cert?.holders) return [];
        const holders = [...cert.holders];
        holders.sort((a, b) => {
            let valA, valB;
            if (sortConfig.key === 'date') {
                valA = parseDate(a.issue_date).getTime();
                valB = parseDate(b.issue_date).getTime();
            } else if (sortConfig.key === 'name') {
                valA = (a.name || a.alias).toLowerCase();
                valB = (b.name || b.alias).toLowerCase();
            } else if (sortConfig.key === 'status') {
                valA = a.is_expired ? 0 : 1;
                valB = b.is_expired ? 0 : 1;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return holders;
    }, [cert, sortConfig]);

    const stats = useMemo(() => {
        if (!cert?.holders || cert.holders.length === 0) return { total: 0, lastIssuedTo: 'N/A' };
        const sorted = [...cert.holders].sort((a, b) => parseDate(b.issue_date) - parseDate(a.issue_date));
        return {
            total: cert.holders.length,
            lastIssuedTo: sorted[0].name || sorted[0].alias,
            lastDate: sorted[0].issue_date
        };
    }, [cert]);

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
    if (!cert) return <div className="min-h-screen bg-white p-8">Certification not found</div>;

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
                    <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-8 text-white relative">
                        <div className="flex items-center space-x-6">
                            <div className="relative">
                                {cert.image_url ? (
                                    <img
                                        src={cert.image_url}
                                        alt={cert.name}
                                        className="h-24 w-24 object-contain drop-shadow-2xl brightness-110"
                                    />
                                ) : (
                                    <div className="bg-white/10 p-5 rounded-2xl ring-4 ring-white/5">
                                        <Award className="h-12 w-12" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-emerald-100/80 text-xs font-black uppercase tracking-[0.2em] mb-1">{cert.topic}</p>
                                <h1 className="text-3xl font-black tracking-tight">{cert.name}</h1>
                            </div>
                        </div>
                        <a
                            href={cert.holders?.[0]?.cert_link || `https://trailheadacademy.salesforce.com/certificate/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-8 right-8 bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-all border border-white/10 hover:border-white/20"
                            title="View on Salesforce"
                        >
                            <ExternalLink className="h-6 w-6" />
                        </a>
                    </div>

                    <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center gap-4">
                                <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                                    <Users className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Holders</p>
                                    <p className="text-3xl font-black text-slate-900">{stats.total}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center gap-4">
                                <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
                                    <CheckCircle className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Last Issued To</p>
                                    <p className="text-xl font-black text-slate-900 truncate max-w-[200px]">{stats.lastIssuedTo}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{stats.lastDate}</p>
                                </div>
                            </div>
                        </div>

                        {/* About section removed per user request */}

                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black text-slate-900 text-slate-900 font-black">Credential Holders</h2>
                            <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                                {sortedHolders.length} People
                            </span>
                        </div>

                        {sortedHolders.length > 0 ? (
                            <div className="overflow-hidden border border-slate-100 rounded-2xl bg-slate-50/50">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/50">
                                            <th
                                                onClick={() => handleSort('name')}
                                                className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 text-slate-400 uppercase tracking-widest text-[10px] font-black">
                                                    Trailblazer
                                                    {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                                </div>
                                            </th>
                                            <th
                                                onClick={() => handleSort('date')}
                                                className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 text-slate-400 uppercase tracking-widest text-[10px] font-black">
                                                    Issue Date
                                                    {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                                </div>
                                            </th>
                                            <th
                                                onClick={() => handleSort('status')}
                                                className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors text-right"
                                            >
                                                <div className="flex items-center justify-end gap-2 text-slate-400 uppercase tracking-widest text-[10px] font-black">
                                                    Status
                                                    {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {sortedHolders.map((holder, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-between group/holder">
                                                        <div onClick={() => router.push(`/trailblazers/${holder.alias}`)} className="cursor-pointer">
                                                            <div className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors uppercase text-sm tracking-tight">{holder.name || holder.alias}</div>
                                                            <div className="text-[9px] text-slate-400 font-mono uppercase tracking-widest mt-0.5">@{holder.alias}</div>
                                                        </div>
                                                        {holder.cert_link && (
                                                            <a
                                                                href={holder.cert_link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-slate-300 hover:text-blue-500 transition-colors p-2"
                                                                title="View Certificate"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                                                    <div className="flex items-center">
                                                        <Calendar className="h-3.5 w-3.5 mr-2 text-slate-300" />
                                                        {holder.issue_date.split('-')[0].trim()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {holder.is_expired ? (
                                                        <span
                                                            title={`Issued: ${holder.issue_date}`}
                                                            className="inline-flex items-center px-3 py-1 rounded-lg bg-orange-50 text-orange-600 text-[10px] font-black uppercase tracking-widest border border-orange-100 cursor-help"
                                                        >
                                                            <Clock className="h-3 w-3 mr-1.5" />
                                                            Expired
                                                        </span>
                                                    ) : (
                                                        <span
                                                            title={`Issued: ${holder.issue_date}`}
                                                            className="inline-flex items-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100 cursor-help"
                                                        >
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
                                <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                <p className="text-slate-400 font-medium italic">No active holders found.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
}
