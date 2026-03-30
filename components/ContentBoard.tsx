import React from "react";
import { ProjectData } from "../types";
import { User, BookOpen, Film, Clock, FileText, Palette, MapPin, Waves } from "lucide-react";
import { getPrimaryPortrait } from "../utils/projectRoles";

interface Props {
  data: ProjectData;
  onSelectEpisode: (index: number) => void;
}

export const ContentBoard: React.FC<Props> = ({ data, onSelectEpisode }) => {
  const { context, episodes } = data;
  const characters = (context.roles || []).filter((role) => role.kind === "person");
  const scenes = (context.roles || []).filter((role) => role.kind === "scene");

  return (
    <div className="h-full overflow-y-auto px-8 pt-20 pb-12 bg-transparent text-[var(--text-primary)] space-y-8 transition-colors">
      <section>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <BookOpen className="text-blue-500" size={24} />
          Project Overview
        </h2>
        <div className="bg-[var(--bg-panel)] p-6 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-900/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          {context.projectSummary ? (
            <div className="space-y-6 relative z-10">
              <div>
                <h3 className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-2">Global Story Arc</h3>
                <p className="text-[var(--text-secondary)] leading-relaxed text-lg whitespace-pre-wrap">
                  {context.projectSummary}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-[var(--text-secondary)] italic flex items-center gap-2">
              <Clock size={16} /> Analysis pending...
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Palette className="text-pink-500" size={24} />
          Style Guide
        </h2>
        <div className="bg-[var(--bg-panel)] p-6 rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] relative overflow-hidden group">
          {data.globalStyleGuide ? (
            <div className="relative">
              <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs text-pink-200 border border-pink-500/30 bg-pink-900/30 px-2 py-1 rounded">User Uploaded</span>
              </div>
              <pre className="text-[var(--text-secondary)] font-sans leading-relaxed text-sm whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
                {data.globalStyleGuide}
              </pre>
            </div>
          ) : (
            <div className="h-24 border border-[var(--border-subtle)] border-dashed rounded-lg flex flex-col items-center justify-center text-[var(--text-secondary)] gap-2 bg-[var(--bg-panel)]/60">
              <Palette size={20} className="opacity-60" />
              <span className="italic">No specific style guide uploaded.</span>
              <span className="text-xs">AI will infer style from context and standard guidelines.</span>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <User className="text-purple-500" size={24} />
          Identity Profiles
        </h2>

        {characters.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
            {characters.map((role) => (
              <IdentityCard key={role.id} role={role} />
            ))}
          </div>
        ) : (
          <div className="h-32 bg-[var(--bg-panel)]/60 rounded-xl border border-[var(--border-subtle)] border-dashed flex items-center justify-center text-[var(--text-secondary)] italic">
            No identity data extracted yet.
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <MapPin className="text-orange-500" size={24} />
          Scene Identities
        </h2>
        {scenes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenes.map((role) => {
              const primaryPortrait = getPrimaryPortrait(role);
              return (
                <div
                  key={role.id}
                  className={`p-4 rounded-xl border ${role.isCore ? "bg-[var(--bg-panel)] border-[var(--border-subtle)] shadow-[var(--shadow-soft)]" : "bg-[var(--bg-panel)]/70 border-[var(--border-subtle)]"}`}
                >
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-[var(--text-primary)]">{role.name}</h3>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-1">@{role.mention}</div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded uppercase ${role.isCore ? "bg-orange-900/30 text-orange-200 border border-orange-800/50" : "bg-white/5 text-[var(--text-secondary)] border border-[var(--border-subtle)]"}`}
                    >
                      {role.isCore ? "core" : "scene"}
                    </span>
                  </div>
                  {primaryPortrait?.imageUrl ? (
                    <img
                      src={primaryPortrait.imageUrl}
                      alt={role.name}
                      className="mb-3 h-36 w-full rounded-lg object-cover border border-[var(--border-subtle)]"
                    />
                  ) : null}
                  <p className="text-sm text-[var(--text-secondary)] mb-2">{role.description}</p>
                  {role.visualTags ? (
                    <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]/60">
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-1">Visual Atmosphere</span>
                      <p className="text-xs text-orange-200 leading-relaxed">{role.visualTags}</p>
                    </div>
                  ) : null}
                  <div className="mt-3 text-[10px] text-[var(--text-secondary)]">
                    定妆照 {role.portraits?.length || 0} 张
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-32 bg-[var(--bg-panel)]/60 rounded-xl border border-[var(--border-subtle)] border-dashed flex items-center justify-center text-[var(--text-secondary)] italic">
            No scene identity data extracted yet.
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Film className="text-green-500" size={24} />
          Episode Outline
        </h2>
        <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] overflow-hidden">
          {episodes.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]/60">
              {episodes.map((ep, idx) => (
                <div key={ep.id} className="p-4 hover:bg-white/5 transition-colors group">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
                      {ep.title}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        ep.status === "completed"
                          ? "bg-green-900/30 text-green-200 border border-green-800/50"
                          : ep.summary
                            ? "bg-blue-900/30 text-blue-200 border border-blue-800/50"
                            : "bg-white/5 text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                      }`}
                    >
                      {ep.status === "completed" ? "Done" : ep.summary ? "Processed" : "Pending"}
                    </span>
                  </div>

                  {ep.summary ? (
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed pl-4 border-l-2 border-green-500/40">
                      {ep.summary}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] italic pl-4 border-l-2 border-[var(--border-subtle)]/60">
                      <FileText size={14} />
                      <span>Summary will be generated during Phase 1 analysis.</span>
                    </div>
                  )}

                  <div className="mt-2 pl-4">
                    <button
                      onClick={() => onSelectEpisode(idx)}
                      className="text-xs text-[var(--accent-blue)] hover:text-sky-300 underline decoration-[var(--accent-blue)]/40"
                    >
                      View Script & Shots
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-[var(--text-secondary)] italic">
              Upload a script to see episodes breakdown.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const IdentityCard: React.FC<{ role: ProjectData["context"]["roles"][number] }> = ({ role }) => {
  const primaryPortrait = getPrimaryPortrait(role);
  return (
    <div className="snap-start min-w-[320px] w-[320px] bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-soft)] hover:border-[var(--accent-blue)]/60 transition-colors">
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/80 rounded-t-xl">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">{role.name}</h3>
            <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">@{role.mention}</div>
          </div>
          <span className="text-xs px-2 py-1 rounded-full border bg-purple-900/30 text-purple-200 border-purple-800/50">
            {role.summary}
          </span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        {primaryPortrait?.imageUrl ? (
          <img
            src={primaryPortrait.imageUrl}
            alt={role.name}
            className="h-40 w-full rounded-lg object-cover border border-[var(--border-subtle)]"
          />
        ) : null}
        <div>
          <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Identity Summary</span>
          <p className="text-sm text-[var(--text-secondary)]">{role.description || "暂无补充描述。"}</p>
        </div>
        <div className="mt-auto space-y-2">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <MapPin size={12} />
            {role.episodeUsage || "区间未设置"}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Waves size={12} />
            定妆照 {role.portraits?.length || 0} 张
          </div>
        </div>
      </div>
    </div>
  );
};
