'use client';

import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

// Interfaces based on the backend schema
interface WorkItem {
  id: string;
  componentId: string;
  severity: string;
  status: string;
  createdAt: string;
}

interface IncidentDetail {
  workItem: WorkItem;
  signals: any[];
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<WorkItem[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetail | null>(null);
  const [rcaForm, setRcaForm] = useState({ rootCause: '', fixApplied: '', preventionSteps: '' });

  useEffect(() => {
    // Fetch initial list of active incidents
    axios.get('http://localhost:3000/incidents')
      .then(res => setIncidents(res.data))
      .catch(console.error);

    // Connect WebSocket to the backend gateway
    const socket = io('ws://localhost:3000');

    socket.on('incident.created', (incident: WorkItem) => {
      setIncidents((prev) => [incident, ...prev].sort((a, b) => a.severity.localeCompare(b.severity)));
    });

    socket.on('incident.status_changed', (updated: WorkItem) => {
      setIncidents((prev) => prev.map(inc => inc.id === updated.id ? { ...inc, ...updated } : inc));
      setSelectedIncident((prev) => {
        if (prev && prev.workItem.id === updated.id) {
          return { ...prev, workItem: { ...prev.workItem, ...updated } };
        }
        return prev;
      });
    });

    socket.on('rca.created', () => {
      // Reload active incidents to drop the CLOSED one
      axios.get('http://localhost:3000/incidents').then(res => setIncidents(res.data));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchDetails = async (id: string) => {
    try {
      const res = await axios.get(`http://localhost:3000/incidents/${id}`);
      setSelectedIncident(res.data);
    } catch (err) {
      console.error('Failed to fetch details', err);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await axios.patch(`http://localhost:3000/incidents/${id}/status`, { status });
  };

  const submitRca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    try {
      await axios.post('http://localhost:3000/rca', {
        workItemId: selectedIncident.workItem.id,
        ...rcaForm
      });
      // Once RCA is created, we can transition to CLOSED
      await updateStatus(selectedIncident.workItem.id, 'CLOSED');
      setSelectedIncident(null);
    } catch (err) {
      console.error('Failed to submit RCA', err);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-8 font-sans">
      <h1 className="text-4xl font-extrabold mb-8 tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-orange-400">
        PulseGuard IMS
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Feed */}
        <div className="bg-neutral-800 p-6 rounded-2xl shadow-xl border border-neutral-700/50">
          <h2 className="text-xl font-bold mb-4 text-neutral-300">Active Incidents</h2>
          <div className="space-y-4">
            {incidents.length === 0 ? <p className="text-neutral-500">No active incidents.</p> : null}
            {incidents.map((inc) => (
              <div 
                key={inc.id} 
                onClick={() => fetchDetails(inc.id)}
                className={`p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02] border ${
                  inc.severity === 'P0' ? 'bg-red-950/30 border-red-500/50 hover:bg-red-900/40' : 
                  inc.severity === 'P1' ? 'bg-orange-950/30 border-orange-500/50 hover:bg-orange-900/40' : 
                  'bg-neutral-800 border-neutral-700 hover:bg-neutral-700/80'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-bold px-2 py-1 rounded text-xs ${
                    inc.severity === 'P0' ? 'bg-red-500 text-white' : 
                    inc.severity === 'P1' ? 'bg-orange-500 text-white' : 
                    'bg-neutral-600 text-white'
                  }`}>{inc.severity}</span>
                  <span className="text-sm font-mono text-neutral-400">{inc.status}</span>
                </div>
                <div className="font-semibold text-lg">{inc.componentId}</div>
                <div className="text-xs text-neutral-500 mt-2">ID: {inc.id.substring(0, 8)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Details & RCA */}
        <div className="bg-neutral-800 p-6 rounded-2xl shadow-xl border border-neutral-700/50">
          {selectedIncident ? (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">
                  {selectedIncident.workItem.componentId}
                </h2>
                <div className="flex gap-2">
                  {['OPEN', 'INVESTIGATING', 'RESOLVED'].map((status) => (
                    <button
                      key={status}
                      onClick={() => updateStatus(selectedIncident.workItem.id, status)}
                      className={`px-3 py-1 text-xs rounded-full font-semibold transition-colors ${
                        selectedIncident.workItem.status === status 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Raw Signals ({selectedIncident.signals.length})</h3>
                <div className="bg-black/50 p-4 rounded-lg h-48 overflow-y-auto font-mono text-xs text-green-400 border border-neutral-800">
                  {selectedIncident.signals.map(s => (
                    <div key={s.signalId} className="mb-2 pb-2 border-b border-neutral-800/50">
                      <span className="text-neutral-500">[{new Date(s.timestamp).toLocaleTimeString()}]</span> {s.payload.message}
                    </div>
                  ))}
                </div>
              </div>

              {selectedIncident.workItem.status === 'RESOLVED' && (
                <div className="bg-neutral-900 p-6 rounded-xl border border-blue-500/30">
                  <h3 className="text-lg font-bold mb-4 text-blue-400">RCA Required for Closure</h3>
                  <form onSubmit={submitRca} className="space-y-4">
                    <select 
                      className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm text-white"
                      value={rcaForm.rootCause}
                      onChange={(e) => setRcaForm({...rcaForm, rootCause: e.target.value})}
                      required
                    >
                      <option value="">Select Root Cause Category</option>
                      <option value="Database Failure">Database Failure</option>
                      <option value="Network Partition">Network Partition</option>
                      <option value="Code Bug">Code Bug</option>
                      <option value="Infrastructure">Infrastructure Issue</option>
                    </select>
                    <textarea 
                      placeholder="Fix Applied" 
                      className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm text-white h-20"
                      value={rcaForm.fixApplied}
                      onChange={(e) => setRcaForm({...rcaForm, fixApplied: e.target.value})}
                      required
                    />
                    <textarea 
                      placeholder="Prevention Steps" 
                      className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm text-white h-20"
                      value={rcaForm.preventionSteps}
                      onChange={(e) => setRcaForm({...rcaForm, preventionSteps: e.target.value})}
                      required
                    />
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded transition-colors">
                      Submit RCA & Close Incident
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-500">
              Select an incident to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
