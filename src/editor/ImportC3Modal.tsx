import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  FileCode,
  FolderOpen,
  Layers,
  Loader2,
  Music,
  PackageOpen,
  Shapes,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  C3ImportResult,
  importConstruct3Archive,
  importConstruct3FileList,
  importConstruct3Json,
  isConstruct3Json,
} from '../engine/c3Importer';
import { ProjectData } from '../engine/types';
import { normalizeLoadedProject } from './helpers';

interface ImportC3ModalProps {
  onClose: () => void;
  onImportProject: (project: ProjectData, noticeText: string) => void;
}

export const ImportC3Modal: React.FC<ImportC3ModalProps> = ({
  onClose,
  onImportProject,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<C3ImportResult | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    setIsParsing(true);
    setError(null);
    setResult(null);

    try {
      if (list.length === 1) {
        const file = list[0];
        const lower = file.name.toLowerCase();

        if (lower.endsWith('.c3p') || lower.endsWith('.zip')) {
          const res = await importConstruct3Archive(file);
          setResult({
            project: normalizeLoadedProject(res.project),
            report: res.report,
          });
          return;
        }

        if (lower.endsWith('.c3proj') || lower.endsWith('.json')) {
          const text = await file.text();
          const parsed = JSON.parse(text) as unknown;

          if (isConstruct3Json(parsed)) {
            const res = await importConstruct3Json(text, file.name);
            setResult({
              project: normalizeLoadedProject(res.project),
              report: res.report,
            });
            return;
          }

          const maybeDestruct = parsed as ProjectData;
          if (maybeDestruct.layouts && maybeDestruct.objectTypes && maybeDestruct.eventSheets) {
            const normalized = normalizeLoadedProject(maybeDestruct);
            onImportProject(normalized, `Loaded "${normalized.name}"`);
            onClose();
            return;
          }

          throw new Error('JSON file is neither a Construct 3 (.c3proj) nor a Destruct project.');
        }

        throw new Error('Unsupported file format. Please select a .c3p, .c3proj, or unpacked C3 folder.');
      }

      // Multiple files / unpacked Construct 3 project folder
      const res = await importConstruct3FileList(list);
      setResult({
        project: normalizeLoadedProject(res.project),
        report: res.report,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import Construct 3 project.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const handleConfirmImport = () => {
    if (!result) return;
    onImportProject(
      result.project,
      `Imported C3 project "${result.report.projectName}" (${result.report.objectCount} objects, ${result.report.layoutCount} layouts)`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#181a20] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-[#1e2129] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
              <PackageOpen className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Import Construct 3 Project
              </h2>
              <p className="text-[11px] text-slate-400">
                100% client-side conversion for .c3p archives, .c3proj manifests, and unpacked C3 folders
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {!result && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-7 text-center transition-colors ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-500/10'
                    : 'border-slate-700 bg-[#13161d] hover:border-slate-600'
                }`}
              >
                {isParsing ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    <div className="text-sm font-medium text-slate-200">
                      Unpacking & converting Construct 3 project...
                    </div>
                    <p className="text-xs text-slate-400">
                      Reading sprites, tilemaps, behaviors, families, audio & event sheets
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        Drop your Construct 3 <span className="text-cyan-400">.c3p</span> file here
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Or choose a single <code className="text-slate-300">.c3p</code> /{' '}
                        <code className="text-slate-300">.c3proj</code> file or an unpacked project folder
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg transition-colors"
                      >
                        <FileArchive className="w-4 h-4" /> Select .c3p / .c3proj
                      </button>

                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#222631] hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg transition-colors"
                      >
                        <FolderOpen className="w-4 h-4 text-amber-400" /> Select C3 Project Folder
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".c3p,.c3proj,.json,.zip"
                  onChange={(e) => {
                    if (e.target.files) void handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                  onChange={(e) => {
                    if (e.target.files) void handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </div>

              {/* Supported C3 Features Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[#14171f] border border-slate-800/90 space-y-1">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Shapes className="w-3.5 h-3.5 text-cyan-400" /> Objects, Art & Maps
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Sprites & animations, collision polygons, TiledBackground, Text, Particles, Tilemap (including RLE tile data & Solid tiles), UI Controls, and Families.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#14171f] border border-slate-800/90 space-y-1">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Events, Audio & Behaviors
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    21 Behaviors (Platform, Solid, Physics, Tween, Turret, LOS, Pathfinding...), Event Sheets, Groups, Includes, Global Variables, and Sounds/Music.
                  </p>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rose-300">Import Error</div>
                <div className="mt-0.5 text-rose-200/90">{error}</div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-white">
                      {result.report.projectName}
                    </div>
                    <div className="text-xs text-emerald-300/90">
                      Ready to open in Destruct (from{' '}
                      {result.report.sourceFormat === 'c3p'
                        ? '.c3p Archive'
                        : result.report.sourceFormat === 'folder'
                        ? 'C3 Project Folder'
                        : '.c3proj Manifest'}
                      )
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setError(null);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md"
                >
                  Choose another
                </button>
              </div>

              {/* Conversion Stats Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-[#13161d] border border-slate-800">
                  <div className="text-base font-bold text-cyan-400">{result.report.objectCount}</div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mt-0.5">
                    <Shapes className="w-3 h-3" /> Objects
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#13161d] border border-slate-800">
                  <div className="text-base font-bold text-indigo-400">{result.report.layoutCount}</div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mt-0.5">
                    <Layers className="w-3 h-3" /> Layouts
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#13161d] border border-slate-800">
                  <div className="text-base font-bold text-emerald-400">{result.report.eventSheetCount}</div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mt-0.5">
                    <FileCode className="w-3 h-3" /> Sheets
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#13161d] border border-slate-800">
                  <div className="text-base font-bold text-amber-400">{result.report.imageCount}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Images</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#13161d] border border-slate-800">
                  <div className="text-base font-bold text-pink-400">{result.report.audioCount}</div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mt-0.5">
                    <Music className="w-3 h-3" /> Audio
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#13161d] border border-slate-800">
                  <div className="text-base font-bold text-sky-400">{result.report.globalVarCount}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Globals</div>
                </div>
              </div>

              {/* Warnings / Unmapped Notes */}
              {result.report.warnings.length > 0 && (
                <div className="rounded-xl bg-amber-500/8 border border-amber-500/30 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Compatibility Notes ({result.report.warnings.length})
                  </div>
                  <ul className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-amber-200/85 list-disc list-inside pr-1">
                    {result.report.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-[#14161c] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {result && (
            <button
              type="button"
              onClick={handleConfirmImport}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors"
            >
              Open in Destruct
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
