import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { BEHAVIOR_CATALOG, createDefaultBehaviorProperties } from '../engine/catalog';
import { BehaviorDef, BehaviorType } from '../engine/types';
import { uid } from './helpers';

interface AddBehaviorModalProps {
  existingBehaviors: BehaviorDef[];
  onClose: () => void;
  onAdd: (behavior: BehaviorDef) => void;
}

const ALL_BEHAVIORS = Object.values(BEHAVIOR_CATALOG);

export const AddBehaviorModal: React.FC<AddBehaviorModalProps> = ({ existingBehaviors, onClose, onAdd }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | 'Movement' | 'Attributes' | 'General'>('All');

  const filtered = ALL_BEHAVIORS.filter((b) => {
    if (category !== 'All' && b.category !== category) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q);
  });

  const handlePick = (type: BehaviorType) => {
    const entry = BEHAVIOR_CATALOG[type];
    let name = entry.name.replace(/\s+/g, '');
    if (type === 'EightDirection') name = 'EightDir';
    if (existingBehaviors.some((b) => b.name === name)) {
      name = `${name}${existingBehaviors.length + 1}`;
    }
    onAdd({
      id: uid('beh'),
      type,
      name,
      properties: createDefaultBehaviorProperties(type),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-[#1a1d24] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#21252e]">
          <h2 className="text-sm font-semibold text-slate-100">Add Behavior</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-700/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center gap-3 bg-[#181a20]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 21 built-in behaviors..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#14161b] rounded-lg border border-slate-800">
            {(['All', 'Movement', 'Attributes', 'General'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  category === cat ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filtered.map((b) => {
            const alreadyAdded = existingBehaviors.some((eb) => eb.type === b.type);
            return (
              <button
                key={b.type}
                type="button"
                onClick={() => handlePick(b.type)}
                className="text-left p-3 rounded-lg bg-[#14161b] border border-slate-800 hover:border-cyan-500/60 hover:bg-[#1e222b] transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-100">{b.name}</span>
                    <span className="text-[11px] text-slate-400">{b.category}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{b.description}</p>
                </div>
                {alreadyAdded && (
                  <span className="mt-2 text-[11px] text-amber-400">Already attached (click to add another)</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
