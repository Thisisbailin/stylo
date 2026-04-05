
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { ProjectData, RequestStats } from '../types';

interface Props {
  data: ProjectData;
  isDarkMode?: boolean;
}

const ProgressBar = ({ stats, color, label }: { stats: RequestStats, color: string, label: string }) => {
    const percentage = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
    return (
        <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--text-secondary)] font-medium">{label}</span>
                <span className="text-[var(--text-secondary)]">
                    {stats.success} / {stats.total} ({stats.total > 0 ? Math.round(percentage) : 0}%)
                    {stats.error > 0 && <span className="text-red-400 ml-2">({stats.error} err)</span>}
                </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden flex border border-[var(--border-subtle)]/60">
                <div 
                    className={`h-2.5 ${color} transition-all duration-500`} 
                    style={{ width: `${percentage}%` }}
                ></div>
                {stats.error > 0 && (
                     <div className="h-2.5 bg-red-600 transition-all duration-500" style={{ width: `${(stats.error/stats.total)*100}%` }}></div>
                )}
            </div>
        </div>
    );
};

export const Dashboard: React.FC<Props> = ({ data, isDarkMode = true }) => {
  // 1. Calculate general stats
  const totalEpisodes = data.episodes.length;
  const totalShots = data.episodes.reduce((acc, ep) => acc + ep.shots.length, 0);
  const completedEpisodes = data.episodes.filter(e => e.status === 'completed').length;

  // 2. Prepare Shot Count Data (Work Tracking)
  const shotData = data.episodes.map(ep => ({
    name: `Ep ${ep.id}`,
    count: ep.shots.length,
    status: ep.status
  }));

  // 3. Prepare Token Data (Cost Tracking)
  const contextTokens = data.contextUsage?.totalTokens || 0;
  
  // Phase 2, 3, and Storyboard prompts
  const episodeTokenData = data.episodes.map(ep => ({
    name: `Ep ${ep.id}`,
    // Shot Generation
    shotTotal: ep.shotGenUsage?.totalTokens || 0,
    // Sora Generation
    soraTotal: ep.soraGenUsage?.totalTokens || 0,
    // Storyboard Prompt Generation
    storyboardTotal: ep.storyboardGenUsage?.totalTokens || 0,
    // Total for this episode (for reference)
    total:
      (ep.shotGenUsage?.totalTokens || 0) +
      (ep.soraGenUsage?.totalTokens || 0) +
      (ep.storyboardGenUsage?.totalTokens || 0)
  }));

  const totalShotGenTokens = episodeTokenData.reduce((acc, curr) => acc + curr.shotTotal, 0);
  const totalSoraGenTokens = episodeTokenData.reduce((acc, curr) => acc + curr.soraTotal, 0);
  const totalStoryboardGenTokens = episodeTokenData.reduce((acc, curr) => acc + curr.storyboardTotal, 0);
  
  // Visual & Video (Accumulated globals)
  const totalPhase4Tokens = data.phase4Usage?.totalTokens || 0;
  const totalPhase5Tokens = data.phase5Usage?.totalTokens || 0;

  const grandTotalTokens =
    contextTokens +
    totalShotGenTokens +
    totalSoraGenTokens +
    totalStoryboardGenTokens +
    totalPhase4Tokens +
    totalPhase5Tokens;

  // Phase 1 Breakdown Data
  const p1 = data.phase1Usage;
  const phase1BreakdownData = [
      { name: 'Plot Summary', value: p1.projectSummary.totalTokens },
      { name: 'Ep Summaries', value: p1.episodeSummaries.totalTokens },
      { name: 'Char List', value: p1.charList.totalTokens },
      { name: 'Char Deep', value: p1.charDeepDive.totalTokens },
      { name: 'Loc List', value: p1.locList.totalTokens },
      { name: 'Loc Deep', value: p1.locDeepDive.totalTokens },
  ].filter(d => d.value > 0);

  // Pie Chart Data
  const distributionData = [
    { name: 'Phase 1 & General', value: contextTokens },
    { name: 'Phase 2: Shot Gen', value: totalShotGenTokens },
    { name: 'Phase 3: Sora Gen', value: totalSoraGenTokens },
    { name: 'Phase 4: Storyboard Prompts', value: totalStoryboardGenTokens },
    { name: 'Phase 4b: Visuals', value: totalPhase4Tokens },
    { name: 'Phase 5: Video', value: totalPhase5Tokens }
  ].filter(d => d.value > 0);

  const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1'];
  
  const chartAxisColor = isDarkMode ? '#9ca3af' : '#6b7280';
  const chartGridColor = isDarkMode ? '#374151' : '#e5e7eb';
  const tooltipBg = isDarkMode ? '#111827' : '#ffffff';
  const tooltipText = isDarkMode ? '#fff' : '#111827';
  const tooltipBorder = isDarkMode ? '#374151' : '#e5e7eb';

  return (
    <div className="px-6 pt-20 pb-12 h-full overflow-y-auto space-y-8 bg-transparent text-[var(--text-primary)] transition-colors">
      <div className="bg-[var(--bg-panel)]/90 p-4 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-[var(--text-secondary)] text-xs uppercase font-bold tracking-wider">Account</h3>
          <p className="text-lg font-semibold text-[var(--text-primary)] mt-1">Qalam Workspace</p>
          <p className="text-sm text-[var(--text-secondary)]">Qalam · 在头像菜单可切换账户、主题与项目追踪。</p>
        </div>
        <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-muted)]/60 px-3 py-1.5 rounded-full border border-[var(--border-subtle)]">
          Dashboard · 账户入口
        </div>
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[var(--bg-panel)]/90 p-4 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
          <h3 className="text-[var(--text-secondary)] text-xs uppercase font-bold tracking-wider">Total Episodes</h3>
          <div className="flex items-end justify-between mt-2">
             <p className="text-3xl font-bold text-[var(--text-primary)]">{totalEpisodes}</p>
             <span className="text-sm text-[var(--text-secondary)]">{completedEpisodes} Completed</span>
          </div>
        </div>
        <div className="bg-[var(--bg-panel)]/90 p-4 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
          <h3 className="text-[var(--text-secondary)] text-xs uppercase font-bold tracking-wider">Total Shots</h3>
          <p className="text-3xl font-bold text-blue-400 mt-2">{totalShots}</p>
        </div>
        <div className="bg-[var(--bg-panel)]/90 p-4 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
          <h3 className="text-[var(--text-secondary)] text-xs uppercase font-bold tracking-wider">Total Token Usage</h3>
          <p className="text-3xl font-bold text-yellow-400 mt-2">{grandTotalTokens.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--bg-panel)]/90 p-4 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
          <h3 className="text-[var(--text-secondary)] text-xs uppercase font-bold tracking-wider">Avg Tokens / Ep</h3>
          <p className="text-3xl font-bold text-purple-300 mt-2">
            {totalEpisodes > 0 ? Math.round(grandTotalTokens / totalEpisodes).toLocaleString() : 0}
          </p>
        </div>
      </div>
      
      {/* SECTION 0: SYSTEM HEALTH & PERFORMANCE */}
      <div className="bg-[var(--bg-panel)]/90 p-6 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
        <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 mb-6">
            🛠 System Health & Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
                <ProgressBar stats={data.stats.context} color="bg-emerald-500" label="Context Analysis" />
            </div>
            <div>
                <ProgressBar stats={data.stats.shotGen} color="bg-blue-500" label="Shot List Generation" />
            </div>
            <div>
                <ProgressBar stats={data.stats.soraGen} color="bg-indigo-500" label="Sora Prompt Writing" />
            </div>
            <div>
                <ProgressBar stats={data.stats.storyboardGen} color="bg-amber-500" label="Storyboard Prompt Writing" />
            </div>
        </div>
      </div>

      {/* SECTION 1: WORK TRACKING (Shot Distribution) */}
      <div className="bg-[var(--bg-panel)]/90 p-6 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
        <div className="flex justify-between items-center mb-6">
           <div>
             <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
               🎬 Work Analysis
             </h3>
             <p className="text-sm text-[var(--text-secondary)]">Shot count distribution per episode (Pacing Analysis)</p>
           </div>
           <div className="text-right">
              <span className="text-xs font-mono text-blue-400 block">Avg: {totalEpisodes > 0 ? Math.round(totalShots/totalEpisodes) : 0} shots/ep</span>
           </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={shotData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
              <XAxis dataKey="name" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                cursor={{ fill: chartGridColor, opacity: 0.4 }}
                contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, color: tooltipText, borderRadius: '8px' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Bar 
                dataKey="count" 
                name="Shots" 
                fill="#3b82f6" 
                radius={[4, 4, 0, 0]} 
                barSize={40}
                animationDuration={1000}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 2: COST TRACKING (Token Usage) */}
      <div className="space-y-6">
         <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            💰 Cost Analysis
         </h3>

         {/* Detailed Breakdowns Row */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Phase 1 Detailed Breakdown */}
            <div className="bg-[var(--bg-panel)]/90 p-6 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] flex flex-col h-[400px]">
               <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Phase 1: Knowledge Extraction Cost</h3>
               <p className="text-sm text-[var(--text-secondary)] mb-6">Token usage breakdown by script analysis and knowledge-building task</p>
               <div className="flex-1 w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={phase1BreakdownData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                     <XAxis type="number" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                     <YAxis dataKey="name" type="category" stroke={chartAxisColor} fontSize={11} tickLine={false} axisLine={false} width={90} />
                     <Tooltip 
                        cursor={{ fill: chartGridColor, opacity: 0.2 }}
                        contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, color: tooltipText, borderRadius: '8px' }}
                     />
                     <Bar dataKey="value" name="Tokens" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </div>

            {/* Phase 2-4: Cost Per Episode */}
            <div className="bg-[var(--bg-panel)]/90 p-6 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] flex flex-col h-[400px]">
               <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Phase 2-4: Generation Cost</h3>
               <p className="text-sm text-[var(--text-secondary)] mb-6">Token usage per episode for Shot, Sora, and Storyboard generation</p>
               <div className="flex-1 w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={episodeTokenData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                     <XAxis dataKey="name" stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} dy={10} />
                     <YAxis stroke={chartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                     <Tooltip 
                        cursor={{ fill: chartGridColor, opacity: 0.4 }}
                        contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, color: tooltipText, borderRadius: '8px' }}
                     />
                     <Legend wrapperStyle={{ paddingTop: '20px' }} />
                     <Bar dataKey="shotTotal" name="Shot Gen" stackId="a" fill="#3b82f6" />
                     <Bar dataKey="soraTotal" name="Sora Gen" stackId="a" fill="#8b5cf6" />
                     <Bar dataKey="storyboardTotal" name="Storyboard Gen" stackId="a" fill="#f59e0b" />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </div>
         </div>

        {/* Total Cost Distribution */}
        <div className="bg-[var(--bg-panel)]/90 p-6 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] flex flex-col h-[400px]">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Total Project Cost</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6">Total cost breakdown by task type (All Phases)</p>
          
          <div className="flex-1 flex flex-col lg:flex-row items-center justify-center">
             <div className="h-64 w-64 relative flex-shrink-0">
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={distributionData}
                       cx="50%"
                       cy="50%"
                       innerRadius={60}
                       outerRadius={90}
                       paddingAngle={5}
                       dataKey="value"
                       stroke="none"
                     >
                       {distributionData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                       ))}
                     </Pie>
                     <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, color: tooltipText, borderRadius: '8px' }} />
                   </PieChart>
                 </ResponsiveContainer>
                 
                 {/* Center Label */}
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                       <span className="text-xs text-[var(--text-secondary)] block">Total</span>
                       <span className="text-xl font-bold text-[var(--text-primary)]">{(grandTotalTokens / 1000).toFixed(1)}k</span>
                    </div>
                 </div>
             </div>
             
             {/* Legend */}
             <div className="mt-8 lg:mt-0 lg:ml-12 grid grid-cols-1 gap-4">
                {distributionData.map((d, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{backgroundColor: PIE_COLORS[i % PIE_COLORS.length]}}></div>
                        <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{d.name}</p>
                            <p className="text-xs text-[var(--text-secondary)] font-mono">
                                {d.value.toLocaleString()} tokens 
                                <span className="ml-2 text-[var(--text-secondary)]">({grandTotalTokens > 0 ? Math.round((d.value/grandTotalTokens)*100) : 0}%)</span>
                            </p>
                        </div>
                    </div>
                ))}
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};
